import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const API = "http://localhost:3000";
const RPC = process.env.RPC_URL || "https://evmrpc-testnet.0g.ai";
const ORACLE_KEY = process.env.PRIVATE_KEY!;

const provider = new ethers.JsonRpcProvider(RPC);
const oracle = new ethers.Wallet(ORACLE_KEY, provider);

async function main() {
  // Step 1: Create 2 bettor wallets
  const bettor1 = ethers.Wallet.createRandom().connect(provider);
  const bettor2 = ethers.Wallet.createRandom().connect(provider);

  console.log("=== Bettor Wallets ===");
  console.log(`Bettor 1: ${bettor1.address} (key: ${bettor1.privateKey})`);
  console.log(`Bettor 2: ${bettor2.address} (key: ${bettor2.privateKey})`);

  // Step 2: Fund each with 0.3 A0GI from oracle
  console.log("\n=== Funding Bettors ===");
  const fundAmount = ethers.parseEther("0.03");

  const tx1 = await oracle.sendTransaction({ to: bettor1.address, value: fundAmount });
  await tx1.wait();
  const tx2 = await oracle.sendTransaction({ to: bettor2.address, value: fundAmount });
  await Promise.all([tx1.wait(), tx2.wait()]);

  const bal1 = await provider.getBalance(bettor1.address);
  const bal2 = await provider.getBalance(bettor2.address);
  console.log(`Bettor 1 balance: ${ethers.formatEther(bal1)} A0GI`);
  console.log(`Bettor 2 balance: ${ethers.formatEther(bal2)} A0GI`);

  // Step 3: Get current ETH price
  console.log("\n=== Fetching ETH Price ===");
  const priceRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
  const priceData = await priceRes.json() as any;
  const ethPrice = priceData.ethereum.usd;
  console.log(`Current ETH price: $${ethPrice}`);

  // Step 4: Create prediction market (deadline = 60 seconds from now)
  const deadline = Math.floor(Date.now() / 1000) + 60;
  const question = `Will ETH be above $${ethPrice} at ${new Date(deadline * 1000).toISOString()}?`;

  console.log("\n=== Creating Market ===");
  console.log(`Question: ${question}`);

  const createRes = await fetch(`${API}/markets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      deadline,
      description: `Prediction on whether ETH/USD will be above $${ethPrice} in 60 seconds. Current price at creation: $${ethPrice}.`,
      resolutionCriteria: `Check ETH/USD price. If above $${ethPrice}, resolve YES. Otherwise NO.`,
      tags: ["crypto", "eth", "price"],
    }),
  });
  const market = await createRes.json() as any;
  console.log("Market created:", JSON.stringify(market, null, 2));

  const marketId = market.marketId;

  // Step 5: Place bets - Bettor 1 bets YES, Bettor 2 bets NO
  // We need to call the contract directly since bets come from bettor wallets, not the oracle
  console.log("\n=== Placing Bets ===");

  const ABI = [
    "function placeBet(uint256 marketId, bool betYes) external payable",
  ];
  const contract1 = new ethers.Contract(process.env.CONTRACT_ADDRESS!, ABI, bettor1);
  const contract2 = new ethers.Contract(process.env.CONTRACT_ADDRESS!, ABI, bettor2);

  const betAmount = ethers.parseEther("0.01");

  const bet1Tx = await contract1.placeBet(marketId, true, { value: betAmount });
  await bet1Tx.wait();
  console.log(`Bettor 1 bet YES with 0.01 A0GI (tx: ${bet1Tx.hash})`);

  const bet2Tx = await contract2.placeBet(marketId, false, { value: betAmount });
  await bet2Tx.wait();
  console.log(`Bettor 2 bet NO with 0.01 A0GI (tx: ${bet2Tx.hash})`);

  // Step 6: Check market state
  console.log("\n=== Market State ===");
  const stateRes = await fetch(`${API}/markets/${marketId}`);
  const state = await stateRes.json();
  console.log(JSON.stringify(state, null, 2));

  // Step 7: Wait for deadline + resolve
  const waitSecs = deadline - Math.floor(Date.now() / 1000) + 2;
  if (waitSecs > 0) {
    console.log(`\n=== Waiting ${waitSecs}s for deadline... ===`);
    await new Promise((r) => setTimeout(r, waitSecs * 1000));
  }

  console.log("\n=== Resolving Market via AI ===");
  const resolveRes = await fetch(`${API}/markets/${marketId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const resolution = await resolveRes.json();
  console.log("Resolution:", JSON.stringify(resolution, null, 2));

  // Step 8: Check final state
  console.log("\n=== Final Market State ===");
  const finalRes = await fetch(`${API}/markets/${marketId}`);
  const finalState = await finalRes.json();
  console.log(JSON.stringify(finalState, null, 2));

  console.log("\n=== Done! ===");
}

main().catch(console.error);
