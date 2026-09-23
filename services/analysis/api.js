/**
 * Express API — thin HTTP layer over the ZeroMQ push/pull queue.
 *
 * Endpoints:
 *   POST /analyze           — enqueue a wallet analysis job via ZeroMQ push socket
 *   GET  /result/:jobId     — poll for job result (stored in MongoDB)
 *   GET  /profile/:address  — fetch the latest stored result from MongoDB
 *   GET  /health            — health check
 *
 * Hot-path transport: ZeroMQ push socket bound on QUEUE_ENDPOINT.
 * The worker process connects a pull socket to the same port and processes
 * jobs round-robin.
 *
 * Run with:
 *   node src/api.js
 */

import { randomUUID } from "crypto";
import express from "express";
import { getPush, closePush } from "./push.js";
import { getLatestResult, getJobResult, ensureIndexes } from "./db.js";
import { chainIdFromNetwork, networkFromChainId, isMockMode } from "./config.js";

const app  = express();
const PORT = parseInt(process.env.PORT ?? "8000", 10);

const ETH_ADDRESS_RE  = /^0x[0-9a-fA-F]{40}$/;
const ALLOWED_NETWORKS = new Set(["mainnet", "sepolia", "polygon", "arbitrum", "optimism", "base"]);

app.use(express.json());

// ─── Startup ──────────────────────────────────────────────────────────────────

// Try to ensure indexes but don't crash if MongoDB is unavailable
ensureIndexes().then(() => {
  console.info("[api] MongoDB ready");
}).catch(() => {
  // already warned inside ensureIndexes
});

// Initialise the push socket early so the first request isn't delayed
const push = await getPush();

// ─── Endpoints ────────────────────────────────────────────────────────────────

/**
 * POST /analyze
 * Enqueue a wallet analysis job via ZeroMQ push socket.
 * Returns { job_id, status: "PENDING" }
 */
app.post("/analyze", async (req, res) => {
  const { address, network = "mainnet", include_ens = false } = req.body ?? {};

  if (!address || !ETH_ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: "Invalid Ethereum address" });
  }
  if (!ALLOWED_NETWORKS.has(network)) {
    return res.status(400).json({
      error: `network must be one of: ${[...ALLOWED_NETWORKS].join(", ")}`,
    });
  }

  try {
    const jobId   = randomUUID();
    const payload = JSON.stringify({
      jobId,
      walletAddress: address.toLowerCase(),
      network,
      includeEns: include_ens,
    });

    // Send job to worker via ZeroMQ push — round-robin across connected workers
    await push.send(payload);

    return res.status(202).json({ job_id: jobId, status: "PENDING" });
  } catch (err) {
    console.error("[api] Failed to enqueue job:", err);
    return res.status(500).json({ error: "Failed to enqueue analysis job" });
  }
});

/**
 * GET /result/:jobId
 * Poll for the result of an enqueued analysis job.
 *
 * Status values:
 *   PENDING  — job has been sent to a worker, not yet complete
 *   SUCCESS  — completed; result contains the analysis data
 *   FAILURE  — job raised an exception; error contains the message
 */
app.get("/result/:jobId", async (req, res) => {
  const { jobId } = req.params;

  try {
    const record = await getJobResult(jobId);

    if (!record) {
      return res.json({ job_id: jobId, status: "PENDING", stage: "queued", result: null });
    }

    if (record.status === "FAILURE") {
      return res.json({
        job_id: jobId,
        status: "FAILURE",
        stage: record.stage ?? null,
        error: record.error,
      });
    }

    if (record.status === "SUCCESS") {
      return res.json({
        job_id: jobId,
        status: "SUCCESS",
        stage: record.stage ?? "complete",
        result: record.result,
      });
    }

    return res.json({
      job_id: jobId,
      status: "PENDING",
      stage: record.stage ?? "queued",
      result: null,
    });
  } catch (err) {
    console.error("[api] Error fetching job result:", err);
    return res.status(500).json({ error: "Failed to fetch job result" });
  }
});

/**
 * GET /profile/:address
 * Public profile snapshot from the latest stored analysis.
 * Query: ?network=mainnet|sepolia (optional — defaults to most recent chain)
 */
app.get("/profile/:address", async (req, res) => {
  const { address } = req.params;
  const network = typeof req.query.network === "string" ? req.query.network : null;

  if (!ETH_ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: "Invalid Ethereum address" });
  }

  let chainId = null;
  if (network) {
    if (!ALLOWED_NETWORKS.has(network)) {
      return res.status(400).json({
        error: `network must be one of: ${[...ALLOWED_NETWORKS].join(", ")}`,
      });
    }
    try {
      chainId = chainIdFromNetwork(network);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  try {
    const doc = await getLatestResult(address, chainId);
    if (!doc) {
      return res.status(404).json({
        error: `No analysis found for ${address}. POST /analyze to run one.`,
        note: "If MongoDB is unavailable, historical profiles are not accessible.",
      });
    }

    const resolvedNetwork =
      doc.network ?? networkFromChainId(doc.chain_id) ?? "unknown";

    const profile = {
      address: doc.wallet_address,
      network: resolvedNetwork,
      chainId: doc.chain_id,
      score: doc.score,
      tier: doc.tier,
      metricsBreakdown: doc.metrics_breakdown,
      contractCount: doc.contract_count,
      verifiedContractCount: doc.verified_contract_count,
      ensName: doc.ens_name ?? null,
      uniqueInteractors: doc.unique_interactors ?? null,
      deploymentSource: doc.deployment_source ?? null,
      analyzedAt:
        doc.analyzed_at instanceof Date
          ? doc.analyzed_at.toISOString()
          : doc.analyzed_at,
    };

    return res.json(profile);
  } catch (err) {
    console.error("[api] Error fetching profile:", err);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
});

/**
 * GET /health
 */
app.get("/health", async (_req, res) => {
  // Check MongoDB by attempting a lightweight ping
  let mongoStatus = "unavailable";
  try {
    const { getDb } = await import("./db.js");
    const db = await getDb();
    if (db) {
      await db.command({ ping: 1 });
      mongoStatus = "available";
    }
  } catch {
    mongoStatus = "unavailable";
  }

  res.json({
    status: "ok",
    mongodb: mongoStatus,
    uptime: Math.floor(process.uptime()),
    mock_mode: isMockMode(),
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.info(`[api] Chainfolio Worker API listening on http://0.0.0.0:${PORT}`);
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[api] Port ${PORT} is already in use. Stop the other process or set PORT / WORKER_URL in .env.local.`,
    );
  } else {
    console.error("[api] Failed to start:", err.message);
  }
  process.exit(1);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown() {
  console.info("[api] Shutting down...");
  closePush();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT",  shutdown);
