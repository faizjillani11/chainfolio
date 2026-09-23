/**
 * Reputation profile builder for the worker pipeline.
 */

import { computeReputationScore, getScoreTier, CAPS, DISCLAIMER } from "./scoring.js";

function detectBurst(contracts) {
  const timestamped = contracts
    .map((c) => c.timestamp)
    .filter((t) => t > 0)
    .sort((a, b) => a - b);

  if (timestamped.length < CAPS.BURST_THRESHOLD) return false;

  for (let i = 0; i <= timestamped.length - CAPS.BURST_THRESHOLD; i++) {
    const window =
      timestamped[i + CAPS.BURST_THRESHOLD - 1] - timestamped[i];
    if (window <= CAPS.BURST_WINDOW_SECONDS) return true;
  }

  return false;
}

/**
 * @param {Array<{contractAddress: string, timestamp: number, isVerified: boolean}>} contracts
 * @param {{ name: string|null, avatar: string|null, url: string|null, github: string|null }} ens
 * @param {{ alchemyFailed: boolean, etherscanFailed: boolean, ensFailed: boolean, includesENS: boolean }} dataFlags
 */
export function buildReputationProfile(contracts, ens, dataFlags) {
  const score = computeReputationScore(contracts, ens);
  const tier = getScoreTier(score.total);
  const isBurst = detectBurst(contracts);

  const explanations = [];

  if (score.contractCount > 0) {
    const capped = score.cappedAt !== null;
    explanations.push(
      `${score.contractCount} contract deployment${score.contractCount !== 1 ? "s" : ""} detected` +
        (capped ? ` — scored up to ${score.cappedAt} (cap applied)` : "") +
        `. +${score.breakdown.contractDeployments} pts`
    );
  } else {
    explanations.push("No contract deployments found for this address.");
  }

  if (score.verifiedContractCount > 0) {
    explanations.push(
      `${score.verifiedContractCount} contract${score.verifiedContractCount !== 1 ? "s" : ""} verified on Etherscan. +${score.breakdown.verifiedContracts} pts`
    );
  } else if (score.contractCount > 0) {
    explanations.push("No verified contracts found on Etherscan.");
  }

  if (dataFlags.includesENS) {
    if (ens.name) {
      const metaCount = [ens.avatar, ens.url, ens.github].filter(Boolean).length;
      explanations.push(
        `ENS name "${ens.name}" found. +${score.breakdown.ensOwnership} pts ownership` +
          (metaCount > 0
            ? `, +${score.breakdown.ensMetadata} pts from ${metaCount} metadata field${metaCount !== 1 ? "s" : ""}.`
            : ".")
      );
    } else {
      explanations.push("No ENS name found for this address.");
    }
  } else {
    explanations.push("ENS lookup was not included (user opted out).");
  }

  if (score.breakdown.timeMultiplierBonus !== 0) {
    const direction = score.breakdown.timeMultiplierBonus > 0 ? "bonus" : "penalty";
    explanations.push(
      `Time weighting ${direction}: ${score.breakdown.timeMultiplierBonus > 0 ? "+" : ""}${score.breakdown.timeMultiplierBonus} pts ` +
        "(activity >30 days old = 1.2×, <30 days = 0.8×)."
    );
  }

  const warnings = [];

  if (isBurst) {
    warnings.push(
      `High recent deployment activity detected (${CAPS.BURST_THRESHOLD}+ contracts within ${CAPS.BURST_WINDOW_SECONDS / 86400} days). ` +
        "Recent burst activity receives reduced weight."
    );
  }

  if (score.cappedAt !== null) {
    warnings.push(
      `Only the first ${score.cappedAt} deployments were scored. ` +
        "Cap prevents spam boosting."
    );
  }

  if (dataFlags.alchemyFailed && dataFlags.etherscanFailed) {
    warnings.push(
      "Both Alchemy and Etherscan data sources failed. " +
        "Contract list may be incomplete or empty."
    );
  } else if (dataFlags.alchemyFailed) {
    warnings.push(
      "Alchemy data unavailable — fell back to Etherscan. Data may be incomplete."
    );
  } else if (dataFlags.etherscanFailed) {
    warnings.push(
      "Etherscan verification check failed. Verified contract count may be understated."
    );
  }

  if (dataFlags.includesENS && dataFlags.ensFailed) {
    warnings.push("ENS lookup failed. ENS data was not included in scoring.");
  }

  warnings.push(DISCLAIMER);

  return {
    summary: {
      contractCount: score.contractCount,
      verifiedContractCount: score.verifiedContractCount,
      hasENS: score.hasENS,
      ensName: ens.name,
      tier: tier.label,
      tierDescription: tier.description,
    },
    score: score.total,
    breakdown: score.breakdown,
    cappedAt: score.cappedAt,
    explanations,
    warnings,
  };
}

/**
 * Returns true when the response should use HTTP 206 (partial data).
 */
export function isPartialResult(dataFlags) {
  return (
    (dataFlags.alchemyFailed && dataFlags.etherscanFailed) ||
    dataFlags.etherscanFailed ||
    (dataFlags.includesENS && dataFlags.ensFailed)
  );
}
