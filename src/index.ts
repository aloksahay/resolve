import express from "express";
import { config } from "./config";
import marketsRouter from "./routes/markets";
import webhookRouter from "./routes/webhook";
import * as jobStore from "./services/jobStore";
import * as chain from "./services/chain";
import * as machinefi from "./services/machinefi";
import { bot } from "./bot";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", chain: config.rpcUrl, contract: config.contractAddress });
});

app.use("/markets", marketsRouter);
app.use("/webhook", webhookRouter);

app.listen(config.port, () => {
  console.log(`Prediction Market API running on port ${config.port}`);
  console.log(`Chain: ${config.rpcUrl}`);
  console.log(`Contract: ${config.contractAddress}`);
});

// Deadline checker: resolve expired live markets as NO every 60s
setInterval(async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const { jobId, marketId } of jobStore.getExpiredJobs(now)) {
    try {
      const market = await chain.getMarket(marketId);
      if (market.outcome === "Pending") {
        await chain.resolveMarket(marketId, false);
        console.log(`Market ${marketId} resolved NO (deadline passed)`);
      }
    } catch (e: any) {
      console.error(`Failed to resolve expired market ${marketId}:`, e.message);
    }
    jobStore.removeJob(jobId);
    machinefi.stopJob(jobId).catch((e: any) =>
      console.warn(`Failed to stop MachineFi job ${jobId}:`, e.message)
    );
  }
}, 60_000);

// Start Telegram bot if token is configured
if (process.env.TELEGRAM_BOT_TOKEN) {
  bot.start();
  console.log("Telegram bot started");
} else {
  console.log("No TELEGRAM_BOT_TOKEN set, bot not started");
}
