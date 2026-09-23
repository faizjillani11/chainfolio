/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: packages/scoring-spec/scoring.json
 * Regenerate: npm run generate:scoring
 */

export const SPEC_VERSION = "1.0.0";

export const POINTS = {
  CONTRACT_DEPLOYMENT: 5,
  VERIFIED_CONTRACT: 10,
  ENS_OWNERSHIP: 2,
  ENS_METADATA: 3,
};

export const CAPS = {
  MAX_DEPLOYMENTS_SCORED: 10,
  MAX_VERIFIED_SCORED: 10,
  BURST_WINDOW_SECONDS: 604800,
  BURST_THRESHOLD: 3,
};

export const TIME_CONFIG = {
  ESTABLISHED_THRESHOLD_SECONDS: 2592000,
  ESTABLISHED_MULTIPLIER: 1.2,
  RECENT_BURST_MULTIPLIER: 0.8,
};

export const TIERS = [
  [
    0,
    "No Activity",
    "No developer activity detected on-chain"
  ],
  [
    1,
    "Early Activity",
    "Early on-chain deployment activity"
  ],
  [
    10,
    "Active Builder",
    "Regular smart contract deployment activity"
  ],
  [
    30,
    "Established",
    "Consistent on-chain deployment history"
  ],
  [
    60,
    "Prolific",
    "High volume of verified on-chain activity"
  ],
  [
    100,
    "Extensive",
    "Extensive on-chain deployment history"
  ]
];

export const DISCLAIMER = "This profile reflects on-chain activity only and does not guarantee developer skill or code quality. Data may be incomplete.";

export function getTimeMultiplier(timestamp) {
  if (timestamp === 0) return 1;
  const ageSeconds = Math.floor(Date.now() / 1000) - timestamp;
  return ageSeconds > TIME_CONFIG.ESTABLISHED_THRESHOLD_SECONDS
    ? TIME_CONFIG.ESTABLISHED_MULTIPLIER
    : TIME_CONFIG.RECENT_BURST_MULTIPLIER;
}

export function detectBurstContracts(contracts) {
  const burst = new Set();
  const timestamped = contracts
    .filter((c) => c.timestamp > 0)
    .sort((a, b) => a.timestamp - b.timestamp);

  for (let i = 0; i <= timestamped.length - CAPS.BURST_THRESHOLD; i++) {
    const window =
      timestamped[i + CAPS.BURST_THRESHOLD - 1].timestamp - timestamped[i].timestamp;
    if (window <= CAPS.BURST_WINDOW_SECONDS) {
      for (let j = i; j < i + CAPS.BURST_THRESHOLD; j++) {
        burst.add(timestamped[j].contractAddress);
      }
    }
  }
  return burst;
}

export function getScoreTier(score) {
  if (score === 0) {
    return {
      label: "No Activity",
      color: "text-gray-400",
      description: "No developer activity detected on-chain",
    };
  }
  if (score < 10) {
    return {
      label: "Early Activity",
      color: "text-blue-400",
      description: "Early on-chain deployment activity",
    };
  }
  if (score < 30) {
    return {
      label: "Active Builder",
      color: "text-green-400",
      description: "Regular smart contract deployment activity",
    };
  }
  if (score < 60) {
    return {
      label: "Established",
      color: "text-yellow-400",
      description: "Consistent on-chain deployment history",
    };
  }
  if (score < 100) {
    return {
      label: "Prolific",
      color: "text-orange-400",
      description: "High volume of verified on-chain activity",
    };
  }
  return {
    label: "Extensive",
    color: "text-purple-400",
    description: "Extensive on-chain deployment history",
  };
}

/**
 * @param {Array<{contractAddress: string, timestamp: number, isVerified: boolean}>} contracts
 * @param {{ name?: string|null, avatar?: string|null, url?: string|null, github?: string|null }} ens
 */
export function computeReputationScore(contracts, ens) {
  const capped = contracts.slice(0, CAPS.MAX_DEPLOYMENTS_SCORED);
  const wasCapped = contracts.length > CAPS.MAX_DEPLOYMENTS_SCORED;
  const burstAddresses = detectBurstContracts(capped);

  let contractDeploymentPoints = 0;
  let verifiedContractPoints = 0;
  let timeMultiplierBonus = 0;
  let verifiedCount = 0;

  for (const contract of capped) {
    const isBurst = burstAddresses.has(contract.contractAddress);
    const multiplier =
      getTimeMultiplier(contract.timestamp) *
      (isBurst ? TIME_CONFIG.RECENT_BURST_MULTIPLIER : 1);

    const baseDeploy = POINTS.CONTRACT_DEPLOYMENT;
    const deployPts = Math.round(baseDeploy * multiplier);
    contractDeploymentPoints += deployPts;
    timeMultiplierBonus += deployPts - baseDeploy;

    if (contract.isVerified && verifiedCount < CAPS.MAX_VERIFIED_SCORED) {
      const baseVerified = POINTS.VERIFIED_CONTRACT;
      const verifiedPts = Math.round(baseVerified * multiplier);
      verifiedContractPoints += verifiedPts;
      timeMultiplierBonus += verifiedPts - baseVerified;
      verifiedCount++;
    }
  }

  const ensOwnershipPoints = ens.name ? POINTS.ENS_OWNERSHIP : 0;
  let ensMetadataPoints = 0;
  if (ens.name) {
    if (ens.avatar) ensMetadataPoints += POINTS.ENS_METADATA;
    if (ens.url) ensMetadataPoints += POINTS.ENS_METADATA;
    if (ens.github) ensMetadataPoints += POINTS.ENS_METADATA;
  }

  const total =
    contractDeploymentPoints +
    verifiedContractPoints +
    ensOwnershipPoints +
    ensMetadataPoints;

  return {
    total,
    breakdown: {
      contractDeployments: contractDeploymentPoints,
      verifiedContracts: verifiedContractPoints,
      ensOwnership: ensOwnershipPoints,
      ensMetadata: ensMetadataPoints,
      timeMultiplierBonus: Math.round(timeMultiplierBonus),
    },
    contractCount: contracts.length,
    verifiedContractCount: contracts.filter((c) => c.isVerified).length,
    hasENS: Boolean(ens.name),
    cappedAt: wasCapped ? CAPS.MAX_DEPLOYMENTS_SCORED : null,
  };
}
