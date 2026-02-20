import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import { MarketData, MarketMetadata, ResolutionResult, ResolutionEvidence } from "./types";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

function buildPrompt(market: MarketData, metadata: MarketMetadata | null): string {
  const now = new Date().toISOString();
  const deadline = new Date(market.deadline * 1000).toISOString();

  const parts = [
    `Today is ${now}.`,
    `You are resolving a prediction market.`,
    "",
    `Question: "${market.question}"`,
    `Deadline: ${deadline}`,
  ];

  if (metadata) {
    if (metadata.description) parts.push(`Description: ${metadata.description}`);
    if (metadata.resolutionCriteria) parts.push(`Resolution Criteria: ${metadata.resolutionCriteria}`);
    if (metadata.sourceUrls.length > 0) parts.push(`Reference Sources: ${metadata.sourceUrls.join(", ")}`);
  }

  parts.push(
    "",
    "Search the web for current, real-time information to answer this question accurately.",
    "Then respond ONLY with valid JSON in this exact format:",
    '{ "outcome": true/false, "confidence": 0.0-1.0, "reasoning": "explanation citing facts you found", "sources": ["url1", "url2"] }',
    "",
    "Set outcome=true if the event clearly occurred or the condition is met. Set confidence below 0.7 if uncertain."
  );

  return parts.join("\n");
}

export async function resolveWithAI(
  market: MarketData,
  metadata: MarketMetadata | null
): Promise<ResolutionEvidence> {
  const prompt = buildPrompt(market, metadata);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.1,
    },
  });

  const content = response.text ?? "";

  // Pull source URLs from grounding metadata
  const groundingChunks = (response.candidates?.[0]?.groundingMetadata as any)?.groundingChunks ?? [];
  const groundedSources: string[] = groundingChunks
    .map((chunk: any) => chunk.web?.uri)
    .filter(Boolean);

  let result: ResolutionResult;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    const parsed = JSON.parse(jsonMatch[0]);
    result = {
      outcome: Boolean(parsed.outcome),
      confidence: Number(parsed.confidence),
      reasoning: String(parsed.reasoning || ""),
      sources: groundedSources.length > 0 ? groundedSources : (Array.isArray(parsed.sources) ? parsed.sources : []),
      resolvedAt: new Date().toISOString(),
    };
  } catch (e) {
    throw new Error(`Failed to parse AI response: ${content}`);
  }

  return {
    marketId: market.id,
    question: market.question,
    result,
    aiModel: "gemini-2.5-flash",
    prompt,
  };
}

export function meetsConfidenceThreshold(evidence: ResolutionEvidence): boolean {
  return evidence.result.confidence >= config.confidenceThreshold;
}
