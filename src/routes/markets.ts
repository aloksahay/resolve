import { Router, Request, Response } from "express";
import { z } from "zod";
import * as chain from "../services/chain";
import * as storage from "../services/storage";
import * as resolver from "../services/resolver";
import * as npc from "../services/npc";
import * as machinefi from "../services/machinefi";
import * as jobStore from "../services/jobStore";
import { MarketMetadata, LiveMarketMetadata } from "../services/types";
import { config } from "../config";

const router = Router();

const CreateMarketSchema = z.object({
  question: z.string().min(10).max(500),
  deadline: z.number().int().positive(),
  description: z.string().max(2000).optional().default(""),
  resolutionCriteria: z.string().max(1000).optional().default(""),
  sourceUrls: z.array(z.string().url()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
});

// Strictly binary: betYes must be exactly true or false (not truthy/falsy values)
const PlaceBetSchema = z.object({
  betYes: z.boolean({ required_error: "betYes is required", invalid_type_error: "betYes must be exactly true or false" }),
  amountWei: z.string().regex(/^\d+$/, "Must be a wei amount string"),
});

// POST /markets — Create a new market
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = CreateMarketSchema.parse(req.body);

    const metadata: MarketMetadata = {
      question: body.question,
      description: body.description,
      resolutionCriteria: body.resolutionCriteria,
      sourceUrls: body.sourceUrls,
      tags: body.tags,
      createdAt: new Date().toISOString(),
    };

    // Upload metadata to 0G Storage
    let storageRoot: string;
    try {
      storageRoot = await storage.uploadJson(metadata);
    } catch (e: any) {
      console.warn("Storage upload failed, using empty root:", e.message);
      storageRoot = "0x" + "0".repeat(64);
    }

    // Create market on-chain
    const deadlineTimestamp = Math.floor(body.deadline);
    const { marketId, txHash } = await chain.createMarket(
      body.question,
      deadlineTimestamp,
      storageRoot
    );

    // Respond immediately, then fire NPC bets in the background
    res.status(201).json({
      marketId,
      txHash,
      storageRoot,
      question: body.question,
      deadline: deadlineTimestamp,
      npcAddresses: npc.getNpcAddresses(),
    });

    // Non-blocking NPC auto-bets (one YES, one NO)
    npc.placeNpcBets(marketId).catch((e) =>
      console.error("NPC auto-bet error:", e.message)
    );
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: e.errors });
    }
    console.error("Create market error:", e);
    res.status(500).json({ error: e.message });
  }
});

const CreateLiveMarketSchema = z.object({
  condition: z.string().min(5).max(500),
  stream_url: z.string().url(),
  duration_seconds: z.number().int().positive().default(60),
});

// POST /markets/live — Create a market monitored by MachineFi live stream
router.post("/live", async (req: Request, res: Response) => {
  try {
    const body = CreateLiveMarketSchema.parse(req.body);

    const deadline = Math.floor(Date.now() / 1000) + body.duration_seconds;

    const metadata: LiveMarketMetadata = {
      question: body.condition,
      description: `Live stream prediction: ${body.condition}`,
      resolutionCriteria: `MachineFi will monitor the stream and resolve YES when: ${body.condition}`,
      sourceUrls: [body.stream_url],
      tags: ["live", "machinefi"],
      createdAt: new Date().toISOString(),
      streamUrl: body.stream_url,
      machineFiJobId: "",
      condition: body.condition,
    };

    // Upload metadata to 0G Storage (fail-soft)
    let storageRoot: string;
    try {
      storageRoot = await storage.uploadJson(metadata);
    } catch (e: any) {
      console.warn("Storage upload failed, using empty root:", e.message);
      storageRoot = "0x" + "0".repeat(64);
    }

    // Create market on-chain
    const { marketId, txHash } = await chain.createMarket(body.condition, deadline, storageRoot);

    // Start MachineFi live monitor
    const webhookUrl = `${config.webhookBaseUrl}/webhook/machinefi`;
    let jobId: string | null = null;
    try {
      jobId = await machinefi.startLiveMonitor(body.stream_url, body.condition, webhookUrl);
      jobStore.addJob(jobId, marketId, deadline);
      console.log(`MachineFi job ${jobId} started for market ${marketId}`);
    } catch (e: any) {
      console.error("MachineFi startLiveMonitor failed:", e.message);
    }

    res.status(201).json({
      marketId,
      txHash,
      jobId,
      storageRoot,
      condition: body.condition,
      stream_url: body.stream_url,
      deadline,
    });

    // Non-blocking NPC auto-bets
    npc.placeNpcBets(marketId).catch((e) =>
      console.error("NPC auto-bet error:", e.message)
    );
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: e.errors });
    }
    console.error("Create live market error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /markets — List all markets
router.get("/", async (_req: Request, res: Response) => {
  try {
    const markets = await chain.getAllMarkets();
    res.json({ markets, count: markets.length });
  } catch (e: any) {
    console.error("List markets error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /markets/:id — Get market details + metadata
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const market = await chain.getMarket(id);

    let metadata: MarketMetadata | null = null;
    if (market.storageRoot && market.storageRoot !== "0x" + "0".repeat(64)) {
      try {
        metadata = await storage.downloadJson<MarketMetadata>(market.storageRoot);
      } catch (e: any) {
        console.warn("Failed to fetch metadata:", e.message);
      }
    }

    res.json({ market, metadata });
  } catch (e: any) {
    console.error("Get market error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /markets/:id/bet — Place a bet
router.post("/:id/bet", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const body = PlaceBetSchema.parse(req.body);

    const txHash = await chain.placeBet(id, body.betYes, body.amountWei);
    res.json({ txHash, marketId: id, betYes: body.betYes, amountWei: body.amountWei });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: e.errors });
    }
    console.error("Place bet error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /markets/:id/resolve — Trigger AI resolution
router.post("/:id/resolve", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const market = await chain.getMarket(id);

    if (market.outcome !== "Pending") {
      return res.status(400).json({ error: "Market already resolved" });
    }

    // Fetch metadata from storage
    let metadata: MarketMetadata | null = null;
    if (market.storageRoot && market.storageRoot !== "0x" + "0".repeat(64)) {
      try {
        metadata = await storage.downloadJson<MarketMetadata>(market.storageRoot);
      } catch (e: any) {
        console.warn("Failed to fetch metadata for resolution:", e.message);
      }
    }

    // Call AI resolver
    const evidence = await resolver.resolveWithAI(market, metadata);

    if (!resolver.meetsConfidenceThreshold(evidence)) {
      return res.status(200).json({
        resolved: false,
        reason: `Confidence ${evidence.result.confidence} below threshold`,
        evidence: evidence.result,
      });
    }

    // Store evidence to 0G Storage
    let evidenceRoot: string | null = null;
    try {
      evidenceRoot = await storage.uploadJson(evidence);
    } catch (e: any) {
      console.warn("Failed to store evidence:", e.message);
    }

    // Resolve on-chain
    const txHash = await chain.resolveMarket(id, evidence.result.outcome);

    res.json({
      resolved: true,
      txHash,
      outcome: evidence.result.outcome ? "Yes" : "No",
      confidence: evidence.result.confidence,
      reasoning: evidence.result.reasoning,
      evidenceRoot,
    });
  } catch (e: any) {
    console.error("Resolve market error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /markets/:id/resolution — Get resolution evidence
router.get("/:id/resolution", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const market = await chain.getMarket(id);

    if (market.outcome === "Pending") {
      return res.status(400).json({ error: "Market not yet resolved" });
    }

    // The evidence is stored linked to the market — for now return on-chain state
    res.json({
      marketId: id,
      outcome: market.outcome,
      yesPool: market.yesPool,
      noPool: market.noPool,
    });
  } catch (e: any) {
    console.error("Get resolution error:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
