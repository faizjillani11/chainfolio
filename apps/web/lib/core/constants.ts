/**
 * Central constants for the Chainfolio scoring system.
 * Weights, caps, and tiers are defined in scoring-spec/scoring.json.
 */

import spec from "../../../../packages/scoring-spec/scoring.json";

export const POINTS = {
  CONTRACT_DEPLOYMENT: spec.points.contractDeployment,
  VERIFIED_CONTRACT: spec.points.verifiedContract,
  ENS_OWNERSHIP: spec.points.ensOwnership,
  ENS_METADATA: spec.points.ensMetadata,
} as const;

export const CAPS = {
  MAX_DEPLOYMENTS_SCORED: spec.caps.maxDeploymentsScored,
  MAX_VERIFIED_SCORED: spec.caps.maxVerifiedScored,
  BURST_WINDOW_SECONDS: spec.caps.burstWindowSeconds,
  BURST_THRESHOLD: spec.caps.burstThreshold,
} as const;

export const TIME = {
  ESTABLISHED_THRESHOLD_SECONDS: spec.time.establishedThresholdSeconds,
  ESTABLISHED_MULTIPLIER: spec.time.establishedMultiplier,
  RECENT_BURST_MULTIPLIER: spec.time.recentBurstMultiplier,
} as const;

export const DISCLAIMER = spec.disclaimer;

export const METADATA_DISCLAIMER = spec.metadataDisclaimer;
