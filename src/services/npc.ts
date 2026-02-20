import { ethers } from "ethers";
import { config } from "../config";
import { provider } from "./chain";

const BET_ABI = [
  "function placeBet(uint256 marketId, bool betYes) external payable",
];

// NPC 1 always bets YES, NPC 2 always bets NO
const npc1 = config.npcBettor1Key
  ? new ethers.Wallet(config.npcBettor1Key, provider)
  : null;
const npc2 = config.npcBettor2Key
  ? new ethers.Wallet(config.npcBettor2Key, provider)
  : null;

export async function placeNpcBets(marketId: number): Promise<{
  npc1TxHash: string | null;
  npc2TxHash: string | null;
}> {
  if (!npc1 || !npc2) {
    console.warn("NPC bettor keys not configured, skipping auto-bets");
    return { npc1TxHash: null, npc2TxHash: null };
  }

  const betAmount = BigInt(config.npcBetAmountWei);
  const contract1 = new ethers.Contract(config.contractAddress, BET_ABI, npc1);
  const contract2 = new ethers.Contract(config.contractAddress, BET_ABI, npc2);

  let npc1TxHash: string | null = null;
  let npc2TxHash: string | null = null;

  try {
    // NPC1 bets YES, NPC2 bets NO — placed sequentially to avoid nonce conflicts
    const tx1 = await contract1.placeBet(marketId, true, { value: betAmount });
    const receipt1 = await tx1.wait();
    npc1TxHash = receipt1.hash;
    console.log(`NPC1 bet YES on market ${marketId}: ${npc1TxHash}`);

    const tx2 = await contract2.placeBet(marketId, false, { value: betAmount });
    const receipt2 = await tx2.wait();
    npc2TxHash = receipt2.hash;
    console.log(`NPC2 bet NO on market ${marketId}: ${npc2TxHash}`);
  } catch (e: any) {
    console.error(`NPC bets failed for market ${marketId}:`, e.message);
  }

  return { npc1TxHash, npc2TxHash };
}

export function getNpcAddresses(): { npc1: string | null; npc2: string | null } {
  return {
    npc1: npc1?.address ?? null,
    npc2: npc2?.address ?? null,
  };
}
