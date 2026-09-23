/**
 * Task implementations for the analysis service.
 */

import { enqueueEnrichment } from "./queues.js";
import { chainIdFromNetwork, ETHERSCAN_URLS, isMockMode } from "./config.js";
import { normalizeContracts, deduplicateContracts } from "./normalize.js";
import { buildReputationProfile, isPartialResult } from "./profile.js";
import { saveAnalysisResult, updateUniqueInteractors } from "./db.js";
import {
  getDeploymentsForWallet,
  upsertContractDeployments,
  upsertContractVerification,
} from "./chain-data/read.js";
import { fetchDeployments } from "./chain-data/deployments.js";
import { enrichVerification } from "./chain-data/verification.js";
import { resolveEns } from "./chain-data/ens.js";
import { fetchUniqueSenders } from "./chain-data/interactors.js";
import { sleep } from "./chain-data/http.js";
import { buildMockAnalysis } from "./mock.js";

/**
 * @param {{ walletAddress: string, network?: string, includeEns?: boolean, onProgress?: (stage: string) => void }} params
 */
export async function analyzeWallet({
  walletAddress,
  network = "mainnet",
  includeEns = false,
  onProgress,
}) {
  const address = walletAddress.toLowerCase();
  const chainId = chainIdFromNetwork(network);

  console.info(`[analyzeWallet] Starting: address=${address} chain=${network}`);

  if (isMockMode()) {
    return buildMockAnalysis({ walletAddress: address, network, includeEns, onProgress });
  }

  onProgress?.("deployments");

  const indexed = await getDeploymentsForWallet(address, chainId);

  let contractsRaw;
  let deploymentSource;
  let alchemyFailed = false;
  let etherscanFailed = false;

  if (indexed.source === "indexed") {
    contractsRaw = indexed.contracts;
    deploymentSource = "indexed";

    if (indexed.verificationIncomplete && contractsRaw.length > 0) {
      onProgress?.("verification");
      try {
        contractsRaw = await enrichVerification(contractsRaw, chainId);
        for (const row of contractsRaw) {
          await upsertContractVerification(
            chainId,
            row.contract_address ?? row.contractAddress,
            row.is_verified ?? row.isVerified,
          );
        }
      } catch (err) {
        console.warn(`[analyzeWallet] Indexed verification backfill failed: ${err.message}`);
        etherscanFailed = true;
      }
    }
  } else {
    console.info(`[chain-data] source=live wallet=${address} chain=${chainId}`);
    deploymentSource = "live";

    const live = await fetchDeployments(address, chainId);
    contractsRaw = live.contracts;
    alchemyFailed = live.alchemyFailed;

    onProgress?.("verification");
    try {
      contractsRaw = await enrichVerification(contractsRaw, chainId);
    } catch (err) {
      console.warn(`[analyzeWallet] Verification enrichment failed: ${err.message}`);
      etherscanFailed = true;
    }

    if (contractsRaw.length > 0) {
      await upsertContractDeployments(address, chainId, contractsRaw);
      for (const row of contractsRaw) {
        await upsertContractVerification(
          chainId,
          row.contract_address ?? row.contractAddress,
          row.is_verified ?? row.isVerified,
        );
      }
    }
  }

  const contracts = deduplicateContracts(normalizeContracts(contractsRaw));

  onProgress?.("ens");

  let ens = { name: null, avatar: null, url: null, github: null };
  let ensFailed = false;
  if (includeEns) {
    try {
      ens = await resolveEns(address);
    } catch (err) {
      console.warn(`[analyzeWallet] ENS resolution failed: ${err.message}`);
      ensFailed = true;
    }
  }

  onProgress?.("scoring");

  const dataFlags = {
    alchemyFailed,
    etherscanFailed,
    ensFailed,
    includesENS: includeEns,
    deploymentSource,
  };

  const profile = buildReputationProfile(contracts, ens, dataFlags);

  await saveAnalysisResult({
    walletAddress: address,
    chainId,
    network,
    score: profile.score,
    tier: profile.summary.tier,
    metricsBreakdown: profile.breakdown,
    contracts,
    ensName: ens.name ?? null,
    deploymentSource,
  });

  console.info(
    `[analyzeWallet] Complete: address=${address} score=${profile.score} tier=${profile.summary.tier} contracts=${contracts.length}`,
  );

  const verifiedAddresses = contracts
    .filter((c) => c.isVerified)
    .map((c) => c.contractAddress);

  if (verifiedAddresses.length > 0) {
    enqueueEnrichment(
      {
        walletAddress: address,
        chainId,
        contractAddresses: verifiedAddresses,
      },
      { attempts: 3 },
    );
  }

  return {
    address,
    network,
    deploymentSource,
    ens,
    contracts,
    profile,
    analyzedAt: Math.floor(Date.now() / 1000),
    includesENS: includeEns,
    isPartial: isPartialResult(dataFlags),
  };
}

export async function countUniqueInteractors({ walletAddress, chainId, contractAddresses }) {
  console.info(
    `[countUniqueInteractors] wallet=${walletAddress} contracts=${contractAddresses.length}`,
  );

  const etherscanBase = ETHERSCAN_URLS[chainId] ?? ETHERSCAN_URLS[1];
  const uniqueSenders = new Set();

  for (const contractAddress of contractAddresses) {
    try {
      const senders = await fetchUniqueSenders(contractAddress, etherscanBase);
      for (const s of senders) uniqueSenders.add(s);
      await sleep(250);
    } catch (err) {
      console.warn(`[countUniqueInteractors] Failed for ${contractAddress}: ${err.message}`);
    }
  }

  const count = uniqueSenders.size;
  console.info(`[countUniqueInteractors] wallet=${walletAddress} count=${count}`);

  await updateUniqueInteractors(walletAddress.toLowerCase(), chainId, count);

  return { walletAddress, uniqueInteractors: count };
}
