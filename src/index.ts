import express from "express";
import { config } from "./config";
import marketsRouter from "./routes/markets";
import { bot } from "./bot";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", chain: config.rpcUrl, contract: config.contractAddress });
});

app.use("/markets", marketsRouter);

app.listen(config.port, () => {
  console.log(`Prediction Market API running on port ${config.port}`);
  console.log(`Chain: ${config.rpcUrl}`);
  console.log(`Contract: ${config.contractAddress}`);
});

// Start Telegram bot if token is configured
if (process.env.TELEGRAM_BOT_TOKEN) {
  bot.start();
  console.log("Telegram bot started");
} else {
  console.log("No TELEGRAM_BOT_TOKEN set, bot not started");
}
