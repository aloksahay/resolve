/**
 * 0G Storage service.
 *
 * The testnet FixedPriceFlow contract was upgraded: the `submit` function now
 * expects the full Submission struct `{SubmissionData data, address submitter}`
 * (selector 0xbc8c11f8) instead of the bare SubmissionData the SDK v0.2.9 sends
 * (selector 0xef3e12dc).  We bypass the SDK's Uploader for the on-chain step
 * and call the contract directly, then upload segments via the storage-node
 * JSON-RPC API exactly as the SDK would.
 */

import { ZgFile, Indexer, StorageNode, DEFAULT_CHUNK_SIZE, DEFAULT_SEGMENT_SIZE, DEFAULT_SEGMENT_MAX_CHUNKS } from "@0glabs/0g-ts-sdk";
import { ethers, encodeBase64 } from "ethers";
import { config } from "../config";
import { wallet, provider } from "./chain";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ---------------------------------------------------------------------------
// Correct flow contract ABI — wraps SubmissionData inside a Submission struct
// that also carries the submitter address.
// ---------------------------------------------------------------------------
const FLOW_ABI = [
  {
    inputs: [
      {
        components: [
          {
            components: [
              { name: "length", type: "uint256", internalType: "uint256" },
              { name: "tags",   type: "bytes",   internalType: "bytes"   },
              {
                components: [
                  { name: "root",   type: "bytes32", internalType: "bytes32" },
                  { name: "height", type: "uint256", internalType: "uint256" },
                ],
                name: "nodes", type: "tuple[]", internalType: "struct SubmissionNode[]",
              },
            ],
            name: "data", type: "tuple", internalType: "struct SubmissionData",
          },
          { name: "submitter", type: "address", internalType: "address" },
        ],
        name: "submission", type: "tuple", internalType: "struct Submission",
      },
    ],
    name: "submit",
    outputs: [
      { type: "uint256", name: "" },
      { type: "bytes32", name: "" },
      { type: "uint256", name: "" },
      { type: "uint256", name: "" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  "function market() external view returns (address)",
  // Actual event on the upgraded testnet contract (digest and submitter are indexed;
  // the last param is the SubmissionData struct, not raw bytes):
  // Submit(address indexed, bytes32 indexed, uint256 submissionIndex, uint256 startEntryIndex, uint256 length, (uint256,bytes,(bytes32,uint256)[]) data)
  "event Submit(address indexed submitter, bytes32 indexed digest, uint256 submissionIndex, uint256 startEntryIndex, uint256 length, (uint256,bytes,(bytes32,uint256)[]) data)",
] as const;

const MARKET_ABI = [
  "function pricePerSector() external view returns (uint256)",
] as const;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function calculateFee(submissionData: { nodes: { height: bigint | number }[] }, pricePerSector: bigint): bigint {
  let sectors = 0n;
  for (const node of submissionData.nodes) {
    sectors += 1n << BigInt(node.height.toString());
  }
  return sectors * pricePerSector;
}

// ---------------------------------------------------------------------------
// uploadJson: stores a JSON object in 0G Storage and returns the root hash.
// ---------------------------------------------------------------------------
export async function uploadJson(data: object): Promise<string> {
  const json = JSON.stringify(data, null, 2);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "0g-storage-"));
  const tmpFile = path.join(tmpDir, "data.json");

  try {
    fs.writeFileSync(tmpFile, json);

    // --- 1. Build ZgFile and compute Merkle tree ---
    const zgFile = await ZgFile.fromFilePath(tmpFile);
    const [tree, treeErr] = await zgFile.merkleTree();
    if (treeErr || !tree) throw new Error(`Merkle tree failed: ${treeErr}`);
    const rootHash = tree.rootHash() as string;

    // --- 2. Select storage nodes via indexer ---
    const indexer = new Indexer(config.storageIndexer);
    const [storageNodes, nodesErr] = await (indexer as any).selectNodes(1) as [StorageNode[], Error | null];
    if (nodesErr || !storageNodes.length) throw new Error(`No storage nodes: ${nodesErr}`);

    const status = await storageNodes[0].getStatus();
    if (!status) throw new Error("Could not get storage node status");
    const flowAddress: string = status.networkIdentity.flowAddress;

    // --- 3. Check if data already exists ---
    const existing = await storageNodes[0].getFileInfo(rootHash, true);
    if (existing?.finalized) {
      await zgFile.close();
      return rootHash;
    }

    // --- 4. Create submission data ---
    const [submissionData, subErr] = await zgFile.createSubmission("0x") as [any, Error | null];
    if (subErr || !submissionData) throw new Error(`createSubmission failed: ${subErr}`);

    // --- 5. Calculate fee ---
    const flow = new ethers.Contract(flowAddress, FLOW_ABI, wallet);
    const marketAddr: string = await flow.market();
    const market = new ethers.Contract(marketAddr, MARKET_ABI, provider);
    const pricePerSector: bigint = await market.pricePerSector();
    const fee = calculateFee(submissionData, pricePerSector);

    // --- 6. Submit on-chain with the correct Submission struct ---
    const fullSubmission = {
      data: submissionData,       // { length, tags, nodes }
      submitter: wallet.address,  // required by upgraded contract
    };

    const tx = await flow.submit(fullSubmission, { value: fee });
    const receipt = await tx.wait();

    // --- 7. Extract txSeq from Submit event ---
    let txSeq: number | null = null;
    for (const log of receipt.logs) {
      try {
        const parsed = flow.interface.parseLog(log);
        if (parsed?.name === "Submit") {
          txSeq = Number(parsed.args.submissionIndex);
          break;
        }
      } catch { /* not our event */ }
    }
    if (txSeq === null) throw new Error("Submit event not found in receipt");

    // --- 8. Wait for the storage node to index the log entry ---
    let fileInfo: any = null;
    for (let i = 0; i < 120; i++) {
      await delay(1000);
      fileInfo = await storageNodes[0].getFileInfoByTxSeq(txSeq);
      if (fileInfo) break;
    }
    if (!fileInfo) throw new Error("Storage node did not index log entry within timeout");

    // --- 9. Upload file segments ---
    const numChunks = zgFile.numChunks();
    const rawBytes = fs.readFileSync(tmpFile);

    // Build each segment (for small files there's only segment 0)
    for (let segIdx = 0; segIdx < zgFile.numSegments(); segIdx++) {
      const startChunk = segIdx * DEFAULT_SEGMENT_MAX_CHUNKS;
      if (startChunk >= numChunks) break;

      const endChunk = Math.min(startChunk + DEFAULT_SEGMENT_MAX_CHUNKS, numChunks);
      const segChunks = endChunk - startChunk;
      const paddedLen = segChunks * DEFAULT_CHUNK_SIZE;

      // Slice the raw bytes for this segment, then zero-pad to chunk boundary
      const sliceStart = startChunk * DEFAULT_CHUNK_SIZE;
      const sliceEnd   = Math.min(sliceStart + (segChunks * DEFAULT_CHUNK_SIZE), rawBytes.length);
      const raw        = rawBytes.slice(sliceStart, sliceEnd);
      const padded     = new Uint8Array(paddedLen);
      padded.set(raw);

      const proof = tree.proofAt(segIdx);
      const segWithProof = {
        root:     rootHash,
        data:     encodeBase64(padded),
        index:    segIdx,
        proof:    proof,
        fileSize: zgFile.size(),
      };

      let uploadErr: any = null;
      for (const node of storageNodes) {
        uploadErr = await node.uploadSegmentsByTxSeq([segWithProof], txSeq);
        if (uploadErr == null) break;
      }
      if (uploadErr != null) throw new Error(`Segment upload failed: ${uploadErr}`);
    }

    // --- 10. Wait for finalization ---
    for (let i = 0; i < 120; i++) {
      await delay(1000);
      const info = await storageNodes[0].getFileInfoByTxSeq(txSeq);
      if (info?.finalized) break;
    }

    await zgFile.close();
    return rootHash;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// downloadJson: retrieves a JSON object by root hash from 0G Storage.
// ---------------------------------------------------------------------------
export async function downloadJson<T = any>(rootHash: string): Promise<T> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "0g-download-"));
  const tmpFile = path.join(tmpDir, "data.json");

  try {
    const indexer = new Indexer(config.storageIndexer);
    const downloadErr = await indexer.download(rootHash, tmpFile, true);
    if (downloadErr) throw new Error(`Download failed: ${downloadErr}`);
    const content = fs.readFileSync(tmpFile, "utf-8");
    return JSON.parse(content) as T;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
