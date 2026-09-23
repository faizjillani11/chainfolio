/**
 * Database layer — MongoDB via the official Node.js driver.
 *
 * Graceful degradation: if MongoDB is unavailable, all DB operations
 * are silently skipped and return null/false. The analysis pipeline
 * and queue transport continue working normally without persistence.
 *
 * Collections:
 *   wallet_profiles        — one doc per (wallet_address, chain_id)
 *   analysis_results       — one doc per (wallet_address, chain_id)
 *   job_results            — TTL 1h, stores queue job outcomes
 *   contract_deployments   — indexed deployments (indexer writes)
 *   contract_verifications — Etherscan verification cache (indexer writes)
 *   wallet_deployments     — index coverage marker per deployer+chain
 */

import { MongoClient } from "mongodb";
import { MONGO_URI, MONGO_DB } from "./config.js";

/** In-memory job store when MongoDB is down — required for BFF polling */
/** @type {Map<string, { status: string, stage?: string, result?: unknown, error?: string, created_at: Date }>} */
const _memoryJobs = new Map();

const JOB_TTL_MS = 3600 * 1000;

function pruneMemoryJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, doc] of _memoryJobs) {
    if (doc.created_at.getTime() < cutoff) _memoryJobs.delete(id);
  }
}

/** @type {MongoClient|null} */
let _client = null;

/** @type {boolean} */
let _mongoAvailable = true;

/**
 * Try to get a connected MongoClient.
 * Returns null if MongoDB is unreachable — never throws.
 * @returns {Promise<MongoClient|null>}
 */
async function getClient() {
  if (!_mongoAvailable) return null;
  if (_client) return _client;

  try {
    const client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 3000, // fail fast instead of hanging 30s
      connectTimeoutMS: 3000,
    });
    await client.connect();
    _client = client;

    // If MongoDB goes down after connecting, reset so next call retries
    client.on("close", () => {
      _client = null;
      _mongoAvailable = true; // allow retry on next request
      console.warn("[db] MongoDB connection closed — will retry on next operation");
    });

    return _client;
  } catch (err) {
    _mongoAvailable = false;
    _client = null;
    console.warn(`[db] MongoDB unavailable (${err.message}) — persistence disabled`);
    // Re-enable retry after 30s so it recovers if MongoDB starts later
    setTimeout(() => { _mongoAvailable = true; }, 30_000);
    return null;
  }
}

/**
 * Returns the database instance, or null if MongoDB is unavailable.
 * @returns {Promise<import('mongodb').Db|null>}
 */
export async function getDb() {
  const client = await getClient();
  return client ? client.db(MONGO_DB) : null;
}

/**
 * Create indexes. Safe to call multiple times (idempotent).
 * Silently skips if MongoDB is unavailable.
 */
export async function ensureIndexes() {
  const db = await getDb();
  if (!db) {
    console.warn("[db] Skipping index creation — MongoDB unavailable");
    return;
  }

  try {
    await db.collection("wallet_profiles").createIndex(
      { wallet_address: 1, chain_id: 1 },
      { unique: true, name: "uq_wallet_chain" },
    );
    await db.collection("analysis_results").createIndex(
      { wallet_address: 1, chain_id: 1 },
      { unique: true, name: "uq_result_wallet_chain" },
    );
    await db.collection("analysis_results").createIndex(
      { score: -1 },
      { name: "idx_score_desc" },
    );
    await db.collection("job_results").createIndex(
      { created_at: 1 },
      { expireAfterSeconds: 3600, name: "ttl_job_results" },
    );

    await db.collection("contract_deployments").createIndex(
      { chain_id: 1, contract_address: 1 },
      { unique: true, name: "uq_chain_contract" },
    );
    await db.collection("contract_deployments").createIndex(
      { chain_id: 1, deployer_address: 1 },
      { name: "idx_chain_deployer" },
    );
    await db.collection("contract_verifications").createIndex(
      { chain_id: 1, contract_address: 1 },
      { unique: true, name: "uq_chain_contract_verification" },
    );
    await db.collection("wallet_deployments").createIndex(
      { chain_id: 1, deployer_address: 1 },
      { unique: true, name: "uq_chain_wallet_deployments" },
    );
  } catch (err) {
    console.warn(`[db] Index creation failed: ${err.message}`);
  }
}

/**
 * Upsert wallet profile and analysis result.
 * Silently skips if MongoDB is unavailable.
 * @returns {Promise<boolean>} true if saved, false if skipped
 */
export async function saveAnalysisResult({
  walletAddress, chainId, network, score, tier,
  metricsBreakdown, contracts, ensName, deploymentSource,
}) {
  const db = await getDb();
  if (!db) {
    console.warn(`[db] Skipping saveAnalysisResult for ${walletAddress} — MongoDB unavailable`);
    return false;
  }

  try {
    const now     = new Date();
    const address = walletAddress.toLowerCase();
    const filter  = { wallet_address: address, chain_id: chainId };

    await db.collection("wallet_profiles").updateOne(
      filter,
      {
        $set:         { last_analyzed_at: now },
        $setOnInsert: { first_seen_at: now },
      },
      { upsert: true },
    );

    await db.collection("analysis_results").updateOne(
      filter,
      {
        $set: {
          score,
          tier,
          network:                 network ?? null,
          deployment_source:       deploymentSource ?? null,
          metrics_breakdown:       metricsBreakdown,
          contract_count:          contracts.length,
          verified_contract_count: contracts.filter(
            (c) => c.isVerified === true || c.is_verified === true,
          ).length,
          ens_name:                ensName,
          analyzed_at:             now,
        },
        $setOnInsert: { unique_interactors: null },
      },
      { upsert: true },
    );

    return true;
  } catch (err) {
    console.warn(`[db] saveAnalysisResult failed: ${err.message}`);
    return false;
  }
}

/**
 * Update unique_interactors after enrichment.
 * Silently skips if MongoDB is unavailable.
 */
export async function updateUniqueInteractors(walletAddress, chainId, count) {
  const db = await getDb();
  if (!db) return;

  try {
    await db.collection("analysis_results").updateOne(
      { wallet_address: walletAddress.toLowerCase(), chain_id: chainId },
      { $set: { unique_interactors: count } },
    );
  } catch (err) {
    console.warn(`[db] updateUniqueInteractors failed: ${err.message}`);
  }
}

/**
 * Fetch the latest analysis result for a wallet.
 * Returns null if not found or MongoDB is unavailable.
 * @param {string} walletAddress
 * @param {number|null} [chainId]
 * @returns {Promise<object|null>}
 */
export async function getLatestResult(walletAddress, chainId = null) {
  const db = await getDb();
  if (!db) return null;

  try {
    const filter = { wallet_address: walletAddress.toLowerCase() };
    if (chainId !== null) filter.chain_id = chainId;

    const doc = await db
      .collection("analysis_results")
      .findOne(filter, { sort: { analyzed_at: -1 } });

    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest;
  } catch (err) {
    console.warn(`[db] getLatestResult failed: ${err.message}`);
    return null;
  }
}

/**
 * Persist a job result for GET /result/:jobId polling.
 * Silently skips if MongoDB is unavailable.
 * @returns {Promise<boolean>}
 */
export async function saveJobProgress(jobId, stage) {
  pruneMemoryJobs();
  const existing = _memoryJobs.get(jobId);
  _memoryJobs.set(jobId, {
    status: existing?.status ?? "PENDING",
    stage,
    result: existing?.result ?? null,
    error: existing?.error ?? null,
    created_at: existing?.created_at ?? new Date(),
  });

  const db = await getDb();
  if (!db) return true;

  try {
    await db.collection("job_results").updateOne(
      { job_id: jobId },
      {
        $set: { job_id: jobId, stage, updated_at: new Date() },
        $setOnInsert: {
          status: "PENDING",
          result: null,
          error: null,
          created_at: new Date(),
        },
      },
      { upsert: true },
    );
    return true;
  } catch (err) {
    console.warn(`[db] saveJobProgress failed: ${err.message}`);
    return true;
  }
}

export async function saveJobResult(jobId, { status, result = null, error = null }) {
  pruneMemoryJobs();
  const existing = _memoryJobs.get(jobId);
  _memoryJobs.set(jobId, {
    status,
    stage: status === "SUCCESS" ? "complete" : existing?.stage,
    result,
    error,
    created_at: existing?.created_at ?? new Date(),
  });

  const db = await getDb();
  if (!db) {
    console.warn(`[db] Job ${jobId} stored in memory only — MongoDB unavailable`);
    return true;
  }

  try {
    await db.collection("job_results").updateOne(
      { job_id: jobId },
      {
        $set: {
          job_id: jobId,
          status,
          result,
          error,
          ...(status === "SUCCESS" ? { stage: "complete" } : {}),
          created_at: existing?.created_at ?? new Date(),
        },
      },
      { upsert: true },
    );
    return true;
  } catch (err) {
    console.warn(`[db] saveJobResult failed: ${err.message}`);
    return true;
  }
}

/**
 * Fetch a job result by ID.
 * Returns null if not found or MongoDB is unavailable.
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
export async function getJobResult(jobId) {
  pruneMemoryJobs();
  const mem = _memoryJobs.get(jobId);
  if (mem) {
    const { created_at: _ca, ...rest } = mem;
    return rest;
  }

  const db = await getDb();
  if (!db) return null;

  try {
    const doc = await db.collection("job_results").findOne({ job_id: jobId });
    if (!doc) return null;
    const { _id, job_id, created_at: _ca, updated_at: _ua, ...rest } = doc;
    return rest;
  } catch (err) {
    console.warn(`[db] getJobResult failed: ${err.message}`);
    return null;
  }
}
