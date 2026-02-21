import dotenv from "dotenv";
dotenv.config();

import { uploadJson, downloadJson } from "../src/services/storage";

const testPayload = {
  id: Math.floor(Math.random() * 100_000),
  question: "Will ETH exceed $5000 by end of 2025?",
  startCondition: "ETH price at creation: $3,200.00",
  resolutionCriteria: "Check ETH/USD spot price at deadline. Resolve YES if price > 5000.",
  deadline: Math.floor(Date.now() / 1000) + 3600,
  createdAt: new Date().toISOString(),
};

async function main() {
  console.log("=== 0G Storage Round-Trip Test ===\n");
  console.log("Payload to upload:");
  console.log(JSON.stringify(testPayload, null, 2));

  // --- Upload ---
  console.log("\n[1] Uploading to 0G Storage...");
  let rootHash: string;
  try {
    rootHash = await uploadJson(testPayload);
    console.log(`    Root hash: ${rootHash}`);
  } catch (e: any) {
    console.error("UPLOAD FAILED:", e.message);
    process.exit(1);
  }

  // --- Download ---
  console.log("\n[2] Downloading from 0G Storage...");
  let retrieved: typeof testPayload;
  try {
    retrieved = await downloadJson<typeof testPayload>(rootHash);
    console.log("    Retrieved:");
    console.log(JSON.stringify(retrieved, null, 2));
  } catch (e: any) {
    console.error("DOWNLOAD FAILED:", e.message);
    process.exit(1);
  }

  // --- Verify ---
  console.log("\n[3] Verifying...");
  const original = JSON.stringify(testPayload);
  const roundTripped = JSON.stringify(retrieved);
  if (original === roundTripped) {
    console.log("    PASS: Payload matches exactly.");
  } else {
    console.error("    FAIL: Mismatch detected.");
    console.error("    Expected:", original);
    console.error("    Got:     ", roundTripped);
    process.exit(1);
  }

  console.log("\nDone.");
}

main();
