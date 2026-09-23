/**
 * Deploy Chainfolio contract to Sepolia.
 *
 * Usage:
 *   npm run onchain:compile   # once
 *   npm run onchain:deploy
 *
 * Required env (.env.local):
 *   DEPLOYER_PRIVATE_KEY
 *   NEXT_PUBLIC_ALCHEMY_API_KEY
 *   NFT_METADATA_BASE_URI  — e.g. https://your-domain.com/api/token
 */

import "./load-env.js";
import { ethers } from "ethers";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(root, "artifacts/Chainfolio.json");

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  const baseURI =
    process.env.NFT_METADATA_BASE_URI ??
    (process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/token`
      : "");

  if (!privateKey || !alchemyKey) {
    console.error("Missing DEPLOYER_PRIVATE_KEY or NEXT_PUBLIC_ALCHEMY_API_KEY in .env.local");
    process.exit(1);
  }

  if (!baseURI || baseURI.includes("your-")) {
    console.error(
      "Set NFT_METADATA_BASE_URI in .env.local (e.g. https://your-domain.com/api/token)"
    );
    process.exit(1);
  }

  if (!existsSync(artifactPath)) {
    console.error("Artifact missing. Run: npm run onchain:compile");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(
    `https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`
  );

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log("Deploying from:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  if (balance === BigInt(0)) {
    console.error("No Sepolia ETH. Get some from https://sepoliafaucet.com");
    process.exit(1);
  }

  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );

  console.log("Deploying Chainfolio with baseURI:", baseURI);
  const contract = await factory.deploy(baseURI);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\nChainfolio deployed to:", address);
  console.log("\nAdd to .env.local:");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);
  console.log(`NFT_METADATA_BASE_URI=${baseURI}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
