import { Bot, InlineKeyboard } from "grammy";
import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

import * as chain from "./services/chain";
import * as resolver from "./services/resolver";
import * as npc from "./services/npc";
import { parseUserIntent } from "./services/agent";
import { config } from "./config";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

// Per-user pending bet state: { marketId, betYes }
const pendingBets = new Map<number, { marketId: number; betYes: boolean }>();

function formatMarket(m: Awaited<ReturnType<typeof chain.getMarket>>) {
  const deadline = new Date(m.deadline * 1000).toUTCString();
  const yesEth = ethers.formatEther(m.yesPool);
  const noEth = ethers.formatEther(m.noPool);
  const total = Number(yesEth) + Number(noEth);
  const yesOdds = total > 0 ? ((Number(yesEth) / total) * 100).toFixed(1) : "50.0";
  const noOdds = total > 0 ? ((Number(noEth) / total) * 100).toFixed(1) : "50.0";

  return [
    `📊 *Market #${m.id}*`,
    `❓ ${escMd(m.question)}`,
    `⏰ Deadline: ${escMd(deadline)}`,
    `✅ YES pool: ${yesEth} A0GI (${yesOdds}%)`,
    `❌ NO pool: ${noEth} A0GI (${noOdds}%)`,
    `🔖 Status: *${m.outcome}*`,
  ].join("\n");
}

function escMd(text: string) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

// /start
bot.command("start", async (ctx) => {
  await ctx.reply(
    "🎯 *Prediction Market Bot*\n\n" +
    "Commands:\n" +
    "/markets \\- List all open markets\n" +
    "/market \\<id\\> \\- View a specific market\n" +
    "/create \\<question\\> \\<deadline\\_unix\\> \\- Create a new market\n" +
    "/bet \\<id\\> \\- Place a YES or NO bet\n" +
    "/resolve \\<id\\> \\- Trigger AI resolution\n" +
    "/balances \\- Show NPC wallet balances",
    { parse_mode: "MarkdownV2" }
  );
});

// /markets
bot.command("markets", async (ctx) => {
  await ctx.reply("⏳ Fetching markets...");
  try {
    const markets = await chain.getAllMarkets();
    if (markets.length === 0) {
      return ctx.reply("No markets yet. Use /create to make one.");
    }
    for (const m of markets) {
      const kb = new InlineKeyboard()
        .text("✅ Bet YES", `bet:${m.id}:yes`)
        .text("❌ Bet NO", `bet:${m.id}:no`);
      await ctx.reply(formatMarket(m), {
        parse_mode: "MarkdownV2",
        reply_markup: m.outcome === "Pending" ? kb : undefined,
      });
    }
  } catch (e: any) {
    await ctx.reply(`Error: ${e.message}`);
  }
});

// /market <id>
bot.command("market", async (ctx) => {
  const id = Number(ctx.match?.trim());
  if (isNaN(id)) return ctx.reply("Usage: /market <id>");
  try {
    const m = await chain.getMarket(id);
    const kb = new InlineKeyboard()
      .text("✅ Bet YES", `bet:${id}:yes`)
      .text("❌ Bet NO", `bet:${id}:no`);
    await ctx.reply(formatMarket(m), {
      parse_mode: "MarkdownV2",
      reply_markup: m.outcome === "Pending" ? kb : undefined,
    });
  } catch (e: any) {
    await ctx.reply(`Error: ${e.message}`);
  }
});

// /create <question> <deadline_unix>
bot.command("create", async (ctx) => {
  const parts = ctx.match?.trim().split(" ") ?? [];
  const deadlineStr = parts.pop();
  const question = parts.join(" ");

  if (!question || !deadlineStr || isNaN(Number(deadlineStr))) {
    return ctx.reply(
      "Usage: /create <question> <deadline_unix>\nExample: /create Will ETH hit $3000 by April? 1743465600"
    );
  }

  const deadline = Number(deadlineStr);
  if (deadline <= Math.floor(Date.now() / 1000)) {
    return ctx.reply("Deadline must be in the future.");
  }

  await ctx.reply("⏳ Creating market on-chain...");
  try {
    const { marketId, txHash } = await chain.createMarket(question, deadline, "0x" + "0".repeat(64));
    await ctx.reply(
      `✅ Market #${marketId} created\\!\n` +
      `❓ ${escMd(question)}\n` +
      `🔗 Tx: \`${txHash}\``,
      { parse_mode: "MarkdownV2" }
    );

    // NPC auto-bets in background
    npc.placeNpcBets(marketId).then(({ npc1TxHash, npc2TxHash }) => {
      ctx.reply(
        `🤖 NPC bets placed on market #${marketId}\\!\n` +
        `✅ NPC YES: \`${npc1TxHash ?? "failed"}\`\n` +
        `❌ NPC NO: \`${npc2TxHash ?? "failed"}\``,
        { parse_mode: "MarkdownV2" }
      ).catch(() => {});
    }).catch(() => {});
  } catch (e: any) {
    await ctx.reply(`Error: ${e.message}`);
  }
});

// /bet <id>  (or inline button triggers)
bot.command("bet", async (ctx) => {
  const id = Number(ctx.match?.trim());
  if (isNaN(id)) return ctx.reply("Usage: /bet <id>");

  const kb = new InlineKeyboard()
    .text("✅ YES", `bet:${id}:yes`)
    .text("❌ NO", `bet:${id}:no`);
  await ctx.reply(`Place your bet on market #${id}:`, { reply_markup: kb });
});

// Inline button: bet:<id>:<yes|no>
bot.callbackQuery(/^bet:(\d+):(yes|no)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const marketId = Number(ctx.match[1]);
  const betYes = ctx.match[2] === "yes";
  const userId = ctx.from.id;

  pendingBets.set(userId, { marketId, betYes });

  await ctx.reply(
    `You're betting *${betYes ? "YES ✅" : "NO ❌"}* on market #${marketId}\\.\n` +
    `Reply with the amount in A0GI \\(e\\.g\\. \`0\\.1\`\\):`,
    { parse_mode: "MarkdownV2" }
  );
});

// Handle amount reply for pending bet
bot.on("message:text", async (ctx) => {
  const userId = ctx.from.id;
  const pending = pendingBets.get(userId);
  if (!pending) return;

  const amount = parseFloat(ctx.message.text.trim());
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply("Invalid amount. Please reply with a number like `0.1`", { parse_mode: "MarkdownV2" });
  }

  pendingBets.delete(userId);
  const amountWei = ethers.parseEther(amount.toString()).toString();

  await ctx.reply(`⏳ Placing ${amount} A0GI bet (${pending.betYes ? "YES" : "NO"}) on market #${pending.marketId}...`);
  try {
    const txHash = await chain.placeBet(pending.marketId, pending.betYes, amountWei);
    await ctx.reply(
      `✅ Bet placed\\!\n` +
      `Market: #${pending.marketId}\n` +
      `Side: *${pending.betYes ? "YES" : "NO"}*\n` +
      `Amount: ${amount} A0GI\n` +
      `🔗 Tx: \`${txHash}\``,
      { parse_mode: "MarkdownV2" }
    );
  } catch (e: any) {
    await ctx.reply(`Error placing bet: ${e.message}`);
  }
});

// /resolve <id>
bot.command("resolve", async (ctx) => {
  const id = Number(ctx.match?.trim());
  if (isNaN(id)) return ctx.reply("Usage: /resolve <id>");

  await ctx.reply(`⏳ Asking AI to resolve market #${id}...`);
  try {
    const market = await chain.getMarket(id);
    if (market.outcome !== "Pending") {
      return ctx.reply(`Market #${id} is already resolved: *${market.outcome}*`, { parse_mode: "MarkdownV2" });
    }

    const evidence = await resolver.resolveWithAI(market, null);

    if (!resolver.meetsConfidenceThreshold(evidence)) {
      return ctx.reply(
        `⚠️ AI confidence too low \\(${evidence.result.confidence}\\) to resolve\\.\n` +
        `Reasoning: ${escMd(evidence.result.reasoning)}`,
        { parse_mode: "MarkdownV2" }
      );
    }

    const txHash = await chain.resolveMarket(id, evidence.result.outcome);
    await ctx.reply(
      `🏁 Market #${id} resolved\\!\n` +
      `Outcome: *${evidence.result.outcome ? "YES ✅" : "NO ❌"}*\n` +
      `Confidence: ${(evidence.result.confidence * 100).toFixed(0)}%\n` +
      `Reasoning: ${escMd(evidence.result.reasoning)}\n` +
      `🔗 Tx: \`${txHash}\``,
      { parse_mode: "MarkdownV2" }
    );
  } catch (e: any) {
    await ctx.reply(`Error: ${e.message}`);
  }
});

// /balances
bot.command("balances", async (ctx) => {
  try {
    const { npc1, npc2 } = npc.getNpcAddresses();
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const [b1, b2] = await Promise.all([
      npc1 ? provider.getBalance(npc1) : Promise.resolve(0n),
      npc2 ? provider.getBalance(npc2) : Promise.resolve(0n),
    ]);
    await ctx.reply(
      `🤖 *NPC Wallet Balances*\n` +
      `NPC1 \\(YES\\): ${escMd(ethers.formatEther(b1))} A0GI\n` +
      `NPC2 \\(NO\\): ${escMd(ethers.formatEther(b2))} A0GI`,
      { parse_mode: "MarkdownV2" }
    );
  } catch (e: any) {
    await ctx.reply(`Error: ${e.message}`);
  }
});

bot.catch((err) => {
  console.error("Bot error:", err.message);
});

export { bot };
