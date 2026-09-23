/**
 * Demo analysis fixtures — used when API keys are not configured.
 * Runs through the same scoring/profile pipeline as live data.
 */

import { buildReputationProfile } from "./profile.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function demoContracts(now) {
  const established = now - 90 * 86400;

  return [
    {
      contractAddress: "0x0000000000000000000000000000000000000001",
      transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
      blockNumber: 18_500_000,
      timestamp: established - 60 * 86400,
      isVerified: true,
    },
    {
      contractAddress: "0x0000000000000000000000000000000000000002",
      transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000002",
      blockNumber: 18_900_000,
      timestamp: established - 30 * 86400,
      isVerified: true,
    },
    {
      contractAddress: "0x0000000000000000000000000000000000000003",
      transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000003",
      blockNumber: 19_100_000,
      timestamp: established - 7 * 86400,
      isVerified: false,
    },
  ];
}

/**
 * @param {{ walletAddress: string, network?: string, includeEns?: boolean, onProgress?: (stage: string) => void }} params
 */
export async function buildMockAnalysis({
  walletAddress,
  network = "mainnet",
  includeEns = false,
  onProgress,
}) {
  const address = walletAddress.toLowerCase();
  const now = Math.floor(Date.now() / 1000);

  onProgress?.("deployments");
  await sleep(200);
  onProgress?.("verification");
  await sleep(200);

  if (includeEns) {
    onProgress?.("ens");
    await sleep(150);
  }

  onProgress?.("scoring");
  await sleep(150);

  const contracts = demoContracts(now);
  const ens = includeEns
    ? {
        name: "demo-builder.eth",
        avatar: null,
        url: "https://example.com",
        github: "demo-dev",
      }
    : { name: null, avatar: null, url: null, github: null };

  const dataFlags = {
    alchemyFailed: false,
    etherscanFailed: false,
    ensFailed: false,
    includesENS: includeEns,
    deploymentSource: "mock",
  };

  const profile = buildReputationProfile(contracts, ens, dataFlags);
  profile.warnings.unshift(
    "Demo mode — sample contracts and scores. Add Alchemy + Etherscan keys to .env.local for real analysis.",
  );

  console.info(`[analyzeWallet] Demo mode: address=${address} chain=${network}`);

  return {
    address,
    network,
    deploymentSource: "mock",
    ens,
    contracts,
    profile,
    analyzedAt: now,
    includesENS: includeEns,
    isPartial: false,
    isMock: true,
  };
}
