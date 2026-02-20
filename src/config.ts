import dotenv from "dotenv";
dotenv.config();

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  rpcUrl: process.env.RPC_URL || "https://evmrpc-testnet.0g.ai",
  chainId: Number(process.env.CHAIN_ID || "16602"),
  privateKey: required("PRIVATE_KEY"),
  contractAddress: required("CONTRACT_ADDRESS"),

  storageIndexer: process.env.STORAGE_INDEXER || "https://indexer-storage-testnet-turbo.0g.ai",
  storageRpc: process.env.STORAGE_RPC || "https://evmrpc-testnet.0g.ai",

  computeApiKey: process.env.COMPUTE_API_KEY || "",
  computeBaseUrl: process.env.COMPUTE_BASE_URL || "https://chat-api.0g.ai/v1",

  geminiApiKey: required("GEMINI_API_KEY"),

  npcBettor1Key: process.env.NPC_BETTOR_1_KEY || "",
  npcBettor2Key: process.env.NPC_BETTOR_2_KEY || "",
  npcBetAmountWei: process.env.NPC_BET_AMOUNT_WEI || "5000000000000000",

  port: Number(process.env.PORT || "3000"),
  confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD || "0.7"),
};
