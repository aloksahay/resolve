import { ethers } from "ethers";
import { config } from "../config";
import { MarketData } from "./types";

const ABI = [
  "function createMarket(string question, uint256 deadline, bytes32 storageRoot) external returns (uint256)",
  "function placeBet(uint256 marketId, bool betYes) external payable",
  "function resolveMarket(uint256 marketId, bool outcomeYes) external",
  "function claimWinnings(uint256 marketId) external",
  "function getMarket(uint256 marketId) external view returns (tuple(uint256 id, string question, uint256 deadline, address creator, uint256 yesPool, uint256 noPool, uint8 outcome, bytes32 storageRoot))",
  "function getMarketCount() external view returns (uint256)",
  "function setStorageRoot(uint256 marketId, bytes32 storageRoot) external",
  "event MarketCreated(uint256 indexed id, string question, uint256 deadline, address creator)",
  "event BetPlaced(uint256 indexed marketId, address indexed bettor, bool betYes, uint256 amount)",
  "event MarketResolved(uint256 indexed marketId, uint8 outcome)",
];

const OUTCOME_MAP = ["Pending", "Yes", "No"] as const;

const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const wallet = new ethers.Wallet(config.privateKey, provider);
const contract = new ethers.Contract(config.contractAddress, ABI, wallet);

function parseMarket(raw: any): MarketData {
  return {
    id: Number(raw.id),
    question: raw.question,
    deadline: Number(raw.deadline),
    creator: raw.creator,
    yesPool: raw.yesPool.toString(),
    noPool: raw.noPool.toString(),
    outcome: OUTCOME_MAP[Number(raw.outcome)],
    storageRoot: raw.storageRoot,
  };
}

export async function createMarket(
  question: string,
  deadline: number,
  storageRoot: string
): Promise<{ marketId: number; txHash: string }> {
  const tx = await contract.createMarket(question, deadline, storageRoot);
  const receipt = await tx.wait();

  const event = receipt.logs
    .map((log: any) => {
      try { return contract.interface.parseLog(log); } catch { return null; }
    })
    .find((e: any) => e?.name === "MarketCreated");

  const marketId = event ? Number(event.args.id) : -1;
  return { marketId, txHash: receipt.hash };
}

export async function placeBet(
  marketId: number,
  betYes: boolean,
  amountWei: string
): Promise<string> {
  const tx = await contract.placeBet(marketId, betYes, { value: amountWei });
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function resolveMarket(
  marketId: number,
  outcomeYes: boolean
): Promise<string> {
  const tx = await contract.resolveMarket(marketId, outcomeYes);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function claimWinnings(marketId: number): Promise<string> {
  const tx = await contract.claimWinnings(marketId);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function getMarket(marketId: number): Promise<MarketData> {
  const raw = await contract.getMarket(marketId);
  return parseMarket(raw);
}

export async function getMarketCount(): Promise<number> {
  return Number(await contract.getMarketCount());
}

export async function getAllMarkets(): Promise<MarketData[]> {
  const count = await getMarketCount();
  const markets: MarketData[] = [];
  for (let i = 0; i < count; i++) {
    try {
      markets.push(await getMarket(i));
    } catch {
      // skip invalid markets
    }
  }
  return markets;
}

export async function setStorageRoot(
  marketId: number,
  storageRoot: string
): Promise<string> {
  const tx = await contract.setStorageRoot(marketId, storageRoot);
  const receipt = await tx.wait();
  return receipt.hash;
}

export { wallet, provider };
