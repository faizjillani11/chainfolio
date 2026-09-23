/**
 * Core type definitions for Chainfolio.
 *
 * Naming conventions:
 *   - Raw*       — data as it comes from an external API (may have gaps)
 *   - Normalized* — cleaned, validated, safe to use in scoring
 *   - *Profile   — structured output ready for the UI
 *   - *Response  — shape of an API response
 */

// ─── Raw / service layer ──────────────────────────────────────────────────────

/** A contract deployment as returned by Alchemy or Etherscan (before normalization) */
export interface ContractDeployment {
  contractAddress: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: number; // Unix timestamp (0 = unknown)
  isVerified: boolean;
  abi?: object[];
}

/** ENS data as returned by the ENS service (before normalization) */
export interface ENSData {
  name: string | null;
  avatar: string | null;
  url: string | null;
  github: string | null;
}

// ─── Normalized layer ─────────────────────────────────────────────────────────

/** Contract deployment after validation and normalization — safe for scoring */
export interface NormalizedContract {
  contractAddress: string;   // always lowercase, always valid
  transactionHash: string;   // may be "" if unknown
  blockNumber: number;       // 0 if unknown
  timestamp: number;         // 0 if unknown
  isVerified: boolean;
}

/** ENS profile after normalization — safe for scoring */
export interface ENSProfile {
  name: string | null;
  avatar: string | null;
  url: string | null;       // always has protocol if non-null
  github: string | null;    // handle only (no @ or URL prefix)
}

// ─── Scoring layer ────────────────────────────────────────────────────────────

export interface ReputationBreakdown {
  contractDeployments: number;
  verifiedContracts: number;
  ensOwnership: number;
  ensMetadata: number;
  timeMultiplierBonus: number; // net bonus/penalty from time weighting
}

export interface ReputationScore {
  total: number;
  breakdown: ReputationBreakdown;
  contractCount: number;
  verifiedContractCount: number;
  hasENS: boolean;
  cappedAt: number | null; // non-null if deployment count was capped
}

// ─── Profile layer ────────────────────────────────────────────────────────────

/** Summary metrics shown at the top of the dashboard */
export interface ProfileSummary {
  contractCount: number;
  verifiedContractCount: number;
  hasENS: boolean;
  ensName: string | null;
  tier: string;
  tierDescription: string;
}

/**
 * Full reputation profile — the structured output of the analysis pipeline.
 * This is what the UI renders.
 */
export interface ReputationProfile {
  summary: ProfileSummary;
  score: number;
  breakdown: ReputationBreakdown;
  cappedAt: number | null;
  /** One sentence per scoring category explaining how points were earned */
  explanations: string[];
  /** Non-blocking notices the UI should surface (data gaps, burst detection, disclaimer) */
  warnings: string[];
}

// ─── API response layer ───────────────────────────────────────────────────────

/**
 * Shape of a successful POST /api/analyze response.
 * This is what the frontend receives and stores in state.
 */
export interface AnalysisResponse {
  address: string;
  network: "mainnet" | "sepolia";
  deploymentSource: "indexed" | "live" | "mock";
  ens: ENSProfile;
  contracts: NormalizedContract[];
  profile: ReputationProfile;
  analyzedAt: number;
  includesENS: boolean;
  /** True when one or more data sources failed during analysis */
  isPartial?: boolean;
  /** True when demo fixtures were used (no API keys) */
  isMock?: boolean;
}

/** Public profile snapshot from GET /api/profile/[address] */
export interface PublicProfileResponse {
  address: string;
  network: string;
  chainId: number;
  score: number;
  tier: string;
  metricsBreakdown: ReputationBreakdown;
  contractCount: number;
  verifiedContractCount: number;
  ensName: string | null;
  uniqueInteractors: number | null;
  deploymentSource: "indexed" | "live" | null;
  analyzedAt: string;
}

export type AnalysisStage =
  | "queued"
  | "deployments"
  | "verification"
  | "ens"
  | "scoring"
  | "complete";

// ─── EAS attestation ─────────────────────────────────────────────────────────

/**
 * State for an EAS attestation request.
 * idle     → user hasn't requested yet
 * signing  → server is signing the delegated payload
 * pending  → user has submitted the tx, waiting for confirmation
 * success  → attestation confirmed on-chain
 * error    → something failed
 */
export interface AttestationState {
  status: "idle" | "signing" | "pending" | "success" | "error";
  uid: string | null;       // on-chain attestation UID once confirmed
  txHash: string | null;
  error: string | null;
}

// ─── UI state ─────────────────────────────────────────────────────────────────

export interface AnalysisState {
  status: "idle" | "loading" | "success" | "error" | "partial";
  data: AnalysisResponse | null;
  error: string | null;
  jobId: string | null;
  stage: AnalysisStage | null;
}

export interface MintState {
  status: "idle" | "pending" | "success" | "error";
  txHash: string | null;
  tokenId: string | null;
  error: string | null;
}
