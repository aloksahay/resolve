import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import * as chain from "./chain";

const client = new OpenAI({
  apiKey: config.computeApiKey,
  baseURL: config.computeBaseUrl,
});

const gemini = new GoogleGenAI({ apiKey: config.geminiApiKey });

export type AgentAction =
  | {
      type: "create_market";
      question: string;
      deadline: number;
      description: string;
      startCondition: string;
      resolutionCriteria: string;
    }
  | { type: "place_bet"; marketId: number; betYes: boolean; amountA0gi: number }
  | { type: "resolve_market"; marketId: number }
  | { type: "list_markets" }
  | { type: "get_market"; marketId: number }
  | { type: "clarify"; message: string }
  | { type: "unknown"; message: string };

// Uses Gemini with live search to fetch current real-world value and turn the
// user's vague question into a precise yes/no with a concrete threshold.
async function enrichMarket(
  rawQuestion: string,
  deadline: number
): Promise<{ question: string; startCondition: string; resolutionCriteria: string }> {
  const deadlineIso = new Date(deadline * 1000).toISOString();

  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `You are setting up a prediction market. The user wants to bet on: "${rawQuestion}"
Market deadline: ${deadlineIso}

Step 1: Search the web for the CURRENT real-world value relevant to this question (price, temperature, score, etc.).
Step 2: Reformulate into a precise YES/NO question using that exact current value as the threshold.
Step 3: Write clear resolution criteria that reference the same source.

Respond ONLY with valid JSON — no markdown, no explanation:
{
  "question": "precise yes/no question with specific numeric threshold and deadline",
  "startCondition": "description of current value at market creation (e.g. 'ETH price at creation: $2,847.12')",
  "resolutionCriteria": "exact instructions for resolving (e.g. 'Check ETH/USD spot price at deadline. Resolve YES if price > 2847.12')"
}`,
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.1,
    },
  });

  const content = response.text ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse enrichment response");
  const parsed = JSON.parse(jsonMatch[0]);

  return {
    question: String(parsed.question),
    startCondition: String(parsed.startCondition),
    resolutionCriteria: String(parsed.resolutionCriteria),
  };
}

const RESOLUTION_DELAY_SECONDS = 60;

async function buildSystemPrompt(): Promise<string> {
  const nowUnix = Math.floor(Date.now() / 1000);
  const nowIso = new Date().toISOString();

  let marketsContext = "";
  try {
    const markets = await chain.getAllMarkets();
    if (markets.length > 0) {
      marketsContext = "\n\nCurrent open markets:\n" + markets
        .filter((m) => m.outcome === "Pending")
        .map((m) => `  - Market #${m.id}: "${m.question}" (deadline: ${new Date(m.deadline * 1000).toISOString()}, YES pool: ${m.yesPool} wei, NO pool: ${m.noPool} wei)`)
        .join("\n");
    }
  } catch {}

  return `You are a prediction market assistant. Users talk to you in natural language and you extract their intent and respond with a JSON action.

Current time: ${nowIso} (unix: ${nowUnix})
${marketsContext}

You must ALWAYS respond with a single valid JSON object. No markdown, no explanation, just JSON.

Available actions:

1. Create a new market:
{"type":"create_market","question":"<topic of the bet, does not need to be a yes/no>","deadline":0,"description":"<context>"}
- Just capture the topic/subject — the deadline and yes/no question are set automatically.
- Set deadline to 0, it will be overridden to now + ${RESOLUTION_DELAY_SECONDS} seconds.

2. Place a bet on an existing market:
{"type":"place_bet","marketId":<number>,"betYes":<true|false>,"amountA0gi":<number>}
- betYes: true = betting YES/for, false = betting NO/against
- amountA0gi: amount in A0GI tokens (default to 0.1 if not specified)
- Match the user's described market to the closest open market by topic

3. Resolve a market:
{"type":"resolve_market","marketId":<number>}

4. List all markets:
{"type":"list_markets"}

5. Get a specific market:
{"type":"get_market","marketId":<number>}

6. If you need more info:
{"type":"clarify","message":"<what you need to know>"}

7. If totally unrelated:
{"type":"unknown","message":"<polite explanation>"}

Examples:
- "will ETH be higher in 60 seconds" → create_market question="ETH price direction"
- "bet on BTC hitting 100k" → create_market question="BTC price vs $100k"
- "I think ETH goes up, bet 0.5" → place_bet on most relevant ETH market, betYes:true, amount:0.5
- "bet against market 2" → place_bet marketId:2 betYes:false amount:0.1
- "resolve market 1" → resolve_market marketId:1
- "what markets are open?" → list_markets`;
}

export async function parseUserIntent(userMessage: string): Promise<AgentAction> {
  const systemPrompt = await buildSystemPrompt();

  const response = await client.chat.completions.create({
    model: "qwen/qwen-2.5-7b-instruct",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.1,
    max_tokens: 512,
  });

  const content = response.choices[0]?.message?.content?.trim() || "";

  let action: AgentAction;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");
    action = JSON.parse(jsonMatch[0]) as AgentAction;
  } catch {
    return { type: "unknown", message: `Could not parse intent from: ${content}` };
  }

  // Hardcode deadline to now + 60s, then enrich with live real-world data
  if (action.type === "create_market") {
    const deadline = Math.floor(Date.now() / 1000) + RESOLUTION_DELAY_SECONDS;
    try {
      const enriched = await enrichMarket(action.question, deadline);
      return { ...action, deadline, ...enriched };
    } catch (e: any) {
      console.warn("Market enrichment failed, using raw question:", e.message);
      return { ...action, deadline, startCondition: "", resolutionCriteria: "" };
    }
  }

  return action;
}
