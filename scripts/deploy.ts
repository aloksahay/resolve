import { ethers } from "hardhat";

async function main() {
  const factory = await ethers.getContractFactory("PredictionMarket");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`PredictionMarket deployed to: ${address}`);
  console.log(`Set CONTRACT_ADDRESS=${address} in your .env`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
