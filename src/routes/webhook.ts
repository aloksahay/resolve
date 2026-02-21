import { Router, Request, Response } from "express";
import * as jobStore from "../services/jobStore";
import * as chain from "../services/chain";
import * as machinefi from "../services/machinefi";

const router = Router();

// POST /webhook/machinefi — Receive MachineFi live monitor events
router.post("/machinefi", async (req: Request, res: Response) => {
  // Always ack immediately — MachineFi retries on non-200
  res.sendStatus(200);

  const event = req.body?.event ?? req.body?.type;
  // job_id can be top-level or nested inside data (error events)
  const jobId = req.body?.job_id ?? req.body?.data?.job_id;

  console.log(`[MachineFi webhook] event=${event} job_id=${jobId}`);

  if (!jobId) {
    console.warn("[MachineFi webhook] No job_id in payload:", req.body);
    return;
  }

  if (event === "watch_triggered") {
    const marketId = jobStore.getMarketId(jobId);
    if (marketId === undefined) {
      console.warn(`[MachineFi webhook] No market found for job ${jobId}`);
      return;
    }

    try {
      const market = await chain.getMarket(marketId);
      if (market.outcome !== "Pending") {
        console.log(`[MachineFi webhook] Market ${marketId} already resolved (${market.outcome}), skipping`);
        jobStore.removeJob(jobId);
        return;
      }

      const txHash = await chain.resolveMarket(marketId, true);
      console.log(`[MachineFi webhook] Market ${marketId} resolved YES, tx=${txHash}`);
      jobStore.removeJob(jobId);

      // Stop the MachineFi job now that the market is resolved
      machinefi.stopJob(jobId).catch((e: any) =>
        console.warn(`[MachineFi webhook] stopJob ${jobId} failed:`, e.message)
      );
    } catch (e: any) {
      console.error(`[MachineFi webhook] Failed to resolve market ${marketId}:`, e.message);
    }
  } else if (event === "job_stopped" || event === "error") {
    console.log(`[MachineFi webhook] Job ${jobId} stopped/error:`, JSON.stringify(req.body));
  } else {
    console.log(`[MachineFi webhook] Unhandled event type: ${event}`);
  }
});

export default router;
