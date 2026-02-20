import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const oracle = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
const npc1Addr = process.env.NPC_BETTOR_1_KEY
  ? new ethers.Wallet(process.env.NPC_BETTOR_1_KEY).address
  : null;
const npc2Addr = process.env.NPC_BETTOR_2_KEY
  ? new ethers.Wallet(process.env.NPC_BETTOR_2_KEY).address
  : null;

async function main() {
  const [b0, b1, b2] = await Promise.all([
    provider.getBalance(oracle.address),
    npc1Addr ? provider.getBalance(npc1Addr) : Promise.resolve(0n),
    npc2Addr ? provider.getBalance(npc2Addr) : Promise.resolve(0n),
  ]);

  console.log(`Oracle (${oracle.address}): ${ethers.formatEther(b0)} A0GI`);
  console.log(`NPC1   (${npc1Addr}): ${ethers.formatEther(b1)} A0GI`);
  console.log(`NPC2   (${npc2Addr}): ${ethers.formatEther(b2)} A0GI`);

  const oracleBalance = Number(ethers.formatEther(b0));
  if (oracleBalance < 10) {
    console.log(`\nOracle has ${oracleBalance} A0GI — need at least 10 to fund NPCs. Aborting.`);
    return;
  }

  console.log(`\nOracle has ${oracleBalance} A0GI — funding NPCs with 3 A0GI each...`);
  const amount = ethers.parseEther("3.0");

  const tx1 = await oracle.sendTransaction({ to: npc1Addr!, value: amount });
  await tx1.wait();
  console.log(`Sent 3 A0GI to NPC1: ${tx1.hash}`);

  const tx2 = await oracle.sendTransaction({ to: npc2Addr!, value: amount });
  await tx2.wait();
  console.log(`Sent 3 A0GI to NPC2: ${tx2.hash}`);

  const [newB1, newB2] = await Promise.all([
    provider.getBalance(npc1Addr!),
    provider.getBalance(npc2Addr!),
  ]);
  console.log(`\nNPC1 new balance: ${ethers.formatEther(newB1)} A0GI`);
  console.log(`NPC2 new balance: ${ethers.formatEther(newB2)} A0GI`);
}

main().catch(console.error);
