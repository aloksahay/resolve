import { Bot, InlineKeyboard } from "grammy";
import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

import * as chain from "./services/chain";
import * as resolver from "./services/resolver";
import * as npc from "./services/npc";
import * as storage from "./services/storage";
import { parseUserIntent } from "./services/agent";
import { config } from "./config";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

// Per-user pending bet state: { marketId, betYes }
const pendingBets = new Map<number, { marketId: number; betYes: boolean }>();

function esc(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatMarket(m: Awaited<ReturnType<typeof chain.getMarket>>) {
  const deadline = new Date(m.deadline * 1000).toUTCString();
  const yesEth = ethers.formatEther(m.yesPool);
  const noEth = ethers.formatEther(m.noPool);
  const total = Number(yesEth) + Number(noEth);
  const yesOdds = total > 0 ? ((Number(yesEth) / total) * 100).toFixed(1) : "50.0";
  const noOdds = total > 0 ? ((Number(noEth) / total) * 100).toFixed(1) : "50.0";

  return [
    `📊 <b>Market #${m.id}</b>`,
    `❓ ${esc(m.question)}`,
    `⏰ Deadline: ${esc(deadline)}`,
    `✅ YES pool: ${yesEth} A0GI (${yesOdds}%)`,
    `❌ NO pool: ${noEth} A0GI (${noOdds}%)`,
    `🔖 Status: <b>${m.outcome}</b>`,
  ].join("\n");
}

// /start
bot.command("start", async (ctx) => {
  await ctx.reply(
    "🎯 <b>Prediction Market Bot</b>\n\n" +
    "Commands:\n" +
    "/markets - List all open markets\n" +
    "/market &lt;id&gt; - View a specific market\n" +
    "/create &lt;question&gt; &lt;deadline_unix&gt; - Create a new market\n" +
    "/bet &lt;id&gt; - Place a YES or NO bet\n" +
    "/resolve &lt;id&gt; - Trigger AI resolution\n" +
    "/balances - Show NPC wallet balances",
    { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
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
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
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
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
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

  await ctx.reply("⏳ Uploading metadata to 0G Storage and creating market on-chain...");
  try {
    let storageRoot = "0x" + "0".repeat(64);
    try {
      storageRoot = await storage.uploadJson({ question, deadline });
    } catch (e: any) {
      console.warn("0G Storage upload failed, proceeding without metadata:", e.message);
    }

    const { marketId, txHash } = await chain.createMarket(question, deadline, storageRoot);
    await ctx.reply(
      `✅ Market #${marketId} created!\n` +
      `❓ ${esc(question)}\n` +
      `📦 Storage: <code>${storageRoot.slice(0, 18)}…</code>\n` +
      `🔗 Tx: <code>${txHash}</code>`,
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
    );

    npc.placeNpcBets(marketId).then(({ npc1TxHash, npc2TxHash }) => {
      ctx.reply(
        `🤖 NPC bets placed on market #${marketId}!\n` +
        `✅ NPC YES: <code>${npc1TxHash ?? "failed"}</code>\n` +
        `❌ NPC NO: <code>${npc2TxHash ?? "failed"}</code>`,
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
      ).catch(() => {});
    }).catch(() => {});
  } catch (e: any) {
    await ctx.reply(`Error: ${e.message}`);
  }
});

// /bet <id>
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
    `You're betting <b>${betYes ? "YES ✅" : "NO ❌"}</b> on market #${marketId}.\n` +
    `Reply with the amount in A0GI (e.g. <code>0.1</code>):`,
    { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
  );
});

// Handle all text: pending bet amounts first, then natural language agent
bot.on("message:text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  const pending = pendingBets.get(userId);
  if (pending) {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply("Invalid amount. Please reply with a number like 0.1");
    }
    pendingBets.delete(userId);
    const amountWei = ethers.parseEther(amount.toString()).toString();
    await ctx.reply(`⏳ Placing ${amount} A0GI bet (${pending.betYes ? "YES" : "NO"}) on market #${pending.marketId}...`);
    try {
      const txHash = await chain.placeBet(pending.marketId, pending.betYes, amountWei);
      await ctx.reply(
        `✅ Bet placed!\nMarket: #${pending.marketId}\nSide: <b>${pending.betYes ? "YES" : "NO"}</b>\nAmount: ${amount} A0GI\n🔗 Tx: <code>${txHash}</code>`,
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
      );
    } catch (e: any) {
      await ctx.reply(`Error: ${e.message}`);
    }
    return;
  }

  if (text.startsWith("/")) return;

  // Natural language → agent
  await ctx.reply("🤖 Thinking...");
  try {
    const action = await parseUserIntent(text);

    switch (action.type) {
      case "list_markets": {
        const markets = await chain.getAllMarkets();
        if (markets.length === 0) {
          await ctx.reply('No markets yet. Try: "Will ETH hit $3000 by April?" to create one.');
          break;
        }
        for (const m of markets) {
          const kb = new InlineKeyboard()
            .text("✅ Bet YES", `bet:${m.id}:yes`)
            .text("❌ Bet NO", `bet:${m.id}:no`);
          await ctx.reply(formatMarket(m), {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
            reply_markup: m.outcome === "Pending" ? kb : undefined,
          });
        }
        break;
      }

      case "get_market": {
        const m = await chain.getMarket(action.marketId);
        const kb = new InlineKeyboard()
          .text("✅ Bet YES", `bet:${m.id}:yes`)
          .text("❌ Bet NO", `bet:${m.id}:no`);
        await ctx.reply(formatMarket(m), {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          reply_markup: m.outcome === "Pending" ? kb : undefined,
        });
        break;
      }

      case "create_market": {
        const preview = [
          `⏳ Creating market on-chain...`,
          `❓ ${esc(action.question)}`,
          action.startCondition ? `📍 <b>Start:</b> ${esc(action.startCondition)}` : "",
          action.resolutionCriteria ? `📋 <b>Resolves:</b> ${esc(action.resolutionCriteria)}` : "",
          `⏰ Resolves in 60 seconds`,
        ].filter(Boolean).join("\n");
        await ctx.reply(preview, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });

        let storageRoot = "0x" + "0".repeat(64);
        try {
          storageRoot = await storage.uploadJson({
            question: action.question,
            deadline: action.deadline,
            description: action.description,
            startCondition: action.startCondition,
            resolutionCriteria: action.resolutionCriteria,
          });
        } catch (e: any) {
          console.warn("0G Storage upload failed, proceeding without metadata:", e.message);
        }

        const { marketId, txHash } = await chain.createMarket(action.question, action.deadline, storageRoot);
        await ctx.reply(
          `✅ <b>Market #${marketId} created!</b>\n❓ ${esc(action.question)}\n📍 ${esc(action.startCondition)}\n📋 ${esc(action.resolutionCriteria)}\n📦 Storage: <code>${storageRoot.slice(0, 18)}…</code>\n🔗 Tx: <code>${txHash}</code>`,
          { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
        );
        npc.placeNpcBets(marketId).then(({ npc1TxHash, npc2TxHash }) => {
          ctx.reply(
            `🤖 NPC bets placed!\n✅ NPC YES: <code>${npc1TxHash ?? "failed"}</code>\n❌ NPC NO: <code>${npc2TxHash ?? "failed"}</code>`,
            { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
          ).catch(() => {});
        }).catch(() => {});

        // Auto-resolve after deadline
        setTimeout(async () => {
          try {
            const res = await fetch(`http://localhost:${config.port}/markets/${marketId}/resolve`, { method: "POST" });
            const data = await res.json() as any;
            if (data.resolved) {
              await ctx.reply(
                `🏁 <b>Market #${marketId} auto-resolved!</b>\nOutcome: <b>${data.outcome}</b>\nConfidence: ${(data.confidence * 100).toFixed(0)}%\nReasoning: ${esc(data.reasoning)}\n🔗 Tx: <code>${data.txHash}</code>`,
                { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
              );
            } else {
              await ctx.reply(`⚠️ Market #${marketId} could not auto-resolve: ${esc(data.reason ?? "unknown")}`);
            }
          } catch (e: any) {
            await ctx.reply(`⚠️ Auto-resolve failed for market #${marketId}: ${e.message}`);
          }
        }, 60_000);
        break;
      }

      case "place_bet": {
        const amountWei = ethers.parseEther(action.amountA0gi.toString()).toString();
        await ctx.reply(`⏳ Placing ${action.amountA0gi} A0GI ${action.betYes ? "YES ✅" : "NO ❌"} bet on market #${action.marketId}...`);
        const txHash = await chain.placeBet(action.marketId, action.betYes, amountWei);
        await ctx.reply(
          `✅ Bet placed!\nMarket: #${action.marketId}\nSide: <b>${action.betYes ? "YES ✅" : "NO ❌"}</b>\nAmount: ${action.amountA0gi} A0GI\n🔗 Tx: <code>${txHash}</code>`,
          { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
        );
        break;
      }

      case "resolve_market": {
        const market = await chain.getMarket(action.marketId);
        if (market.outcome !== "Pending") {
          await ctx.reply(`Market #${action.marketId} is already resolved: <b>${market.outcome}</b>`, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
          break;
        }
        await ctx.reply(`⏳ Asking AI to resolve market #${action.marketId}...`);
        const evidence = await resolver.resolveWithAI(market, null);
        if (!resolver.meetsConfidenceThreshold(evidence)) {
          await ctx.reply(
            `⚠️ AI confidence too low (${evidence.result.confidence}) to resolve.\nReasoning: ${esc(evidence.result.reasoning)}`,
            { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
          );
          break;
        }
        const txHash = await chain.resolveMarket(action.marketId, evidence.result.outcome);
        await ctx.reply(
          `🏁 Market #${action.marketId} resolved!\nOutcome: <b>${evidence.result.outcome ? "YES ✅" : "NO ❌"}</b>\nConfidence: ${(evidence.result.confidence * 100).toFixed(0)}%\nReasoning: ${esc(evidence.result.reasoning)}\n🔗 Tx: <code>${txHash}</code>`,
          { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
        );
        break;
      }

      case "clarify":
        await ctx.reply(`❓ ${esc(action.message)}`, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
        break;

      default:
        await ctx.reply((action as any).message || "I didn't understand that.");
    }
  } catch (e: any) {
    await ctx.reply(`Error: ${e.message}`);
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
      return ctx.reply(`Market #${id} is already resolved: <b>${market.outcome}</b>`, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    }

    const evidence = await resolver.resolveWithAI(market, null);

    if (!resolver.meetsConfidenceThreshold(evidence)) {
      return ctx.reply(
        `⚠️ AI confidence too low (${evidence.result.confidence}) to resolve.\n` +
        `Reasoning: ${esc(evidence.result.reasoning)}`,
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
      );
    }

    const txHash = await chain.resolveMarket(id, evidence.result.outcome);
    await ctx.reply(
      `🏁 Market #${id} resolved!\n` +
      `Outcome: <b>${evidence.result.outcome ? "YES ✅" : "NO ❌"}</b>\n` +
      `Confidence: ${(evidence.result.confidence * 100).toFixed(0)}%\n` +
      `Reasoning: ${esc(evidence.result.reasoning)}\n` +
      `🔗 Tx: <code>${txHash}</code>`,
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
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
      `🤖 <b>NPC Wallet Balances</b>\n` +
      `NPC1 (YES): ${ethers.formatEther(b1)} A0GI\n` +
      `NPC2 (NO): ${ethers.formatEther(b2)} A0GI`,
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
    );
  } catch (e: any) {
    await ctx.reply(`Error: ${e.message}`);
  }
});

bot.catch((err) => {
  console.error("Bot error:", err.message);
});

export { bot };
