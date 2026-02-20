import OpenAI from "openai";
import { config } from "../config";
import { MarketData, MarketMetadata, ResolutionResult, ResolutionEvidence } from "./types";

const client = new OpenAI({
  apiKey: config.computeApiKey,
  baseURL: config.computeBaseUrl,
});

function buildPrompt(market: MarketData, metadata: MarketMetadata | null): string {
  const parts = [
    "You are a prediction market resolver. Your job is to determine whether a predicted event has occurred based on your knowledge.",
    "",
    `Market Question: "${market.question}"`,
    `Deadline: ${new Date(market.deadline * 1000).toISOString()}`,
  ];

  if (metadata) {
    parts.push(`Description: ${metadata.description}`);
    parts.push(`Resolution Criteria: ${metadata.resolutionCriteria}`);
    if (metadata.sourceUrls.length > 0) {
      parts.push(`Reference Sources: ${metadata.sourceUrls.join(", ")}`);
    }
  }

  parts.push(
    "",
    "Based on your knowledge, determine if this event has occurred.",
    "Respond ONLY with valid JSON in this exact format:",
    '{ "outcome": true/false, "confidence": 0.0-1.0, "reasoning": "your explanation", "sources": ["source1", "source2"] }',
    "",
    "If you are unsure, set confidence below 0.5. Only set outcome to true if the event clearly happened."
  );

  return parts.join("\n");
}

export async function resolveWithAI(
  market: MarketData,
  metadata: MarketMetadata | null
): Promise<ResolutionEvidence> {
  const prompt = buildPrompt(market, metadata);

  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "You are a factual prediction market resolution oracle. Always respond with valid JSON." },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    max_tokens: 1024,
  });

  const content = response.choices[0]?.message?.content || "";

  let result: ResolutionResult;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    const parsed = JSON.parse(jsonMatch[0]);
    result = {
      outcome: Boolean(parsed.outcome),
      confidence: Number(parsed.confidence),
      reasoning: String(parsed.reasoning || ""),
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      resolvedAt: new Date().toISOString(),
    };
  } catch (e) {
    throw new Error(`Failed to parse AI response: ${content}`);
  }

  return {
    marketId: market.id,
    question: market.question,
    result,
    aiModel: "deepseek-chat",
    prompt,
  };
}

export function meetsConfidenceThreshold(evidence: ResolutionEvidence): boolean {
  return evidence.result.confidence >= config.confidenceThreshold;
}
