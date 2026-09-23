/**
 * Scoring engine — re-exports from generated module (packages/scoring-spec/scoring.json).
 * Regenerate: npm run generate:scoring
 */

export {
  POINTS,
  CAPS,
  TIME_CONFIG,
  TIERS,
  DISCLAIMER,
  getTimeMultiplier,
  detectBurstContracts,
  getScoreTier,
  computeReputationScore,
} from "./scoring.generated.js";

/** @deprecated use getScoreTier */
export { getScoreTier as getTier } from "./scoring.generated.js";
