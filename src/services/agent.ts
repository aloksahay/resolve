import OpenAI from "openai";
import { config } from "../config";
import * as chain from "./chain";

const client = new OpenAI({
  apiKey: config.computeApiKey,
  baseURL: config.computeBaseUrl,
});

export type AgentAction =
  | { type: "create_market"; question: string; deadline: number; description: string }
  | { type: "place_bet"; marketId: number; betYes: boolean; amountA0gi: number }
  | { type: "resolve_market"; marketId: number }
  | { type: "list_markets" }
  | { type: "get_market"; marketId: number }
  | { type: "clarify"; message: string }
  | { type: "unknown"; message: string };

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
{"type":"create_market","question":"<yes/no question>","deadline":<unix timestamp>,"description":"<context>"}
- Question must be a clear yes/no question about a future event
- Deadline must be a unix timestamp in the future
- If the user says "in X minutes/hours/days", calculate from now (${nowUnix})

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
- "BTC will hit 100k by April" → create_market with deadline April 1
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

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");
    return JSON.parse(jsonMatch[0]) as AgentAction;
  } catch {
    return { type: "unknown", message: `Could not parse intent from: ${content}` };
  }
}
