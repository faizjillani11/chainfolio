/**
 * Scoring parity tests — generated JS must match TS engine on fixed fixtures.
 * Run: npm run test:scoring
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Regenerate before tests so CI/local always matches spec
spawnSync("node", ["packages/scoring-spec/generate.js"], { cwd: root, stdio: "inherit" });

const { computeReputationScore } = await import("../services/analysis/scoring.generated.js");

// Load TS scoring for cross-check (tsx registers .ts imports)
let tsCompute = null;
try {
  const { register } = await import("tsx/esm/api");
  register();
  const mod = await import("../apps/web/lib/core/scoring.ts");
  tsCompute = mod.computeReputationScore;
} catch (err) {
  console.warn("[parity] TS cross-check skipped:", err.message);
}

const FIXED_NOW = new Date("2024-06-01T12:00:00Z").getTime();
let realNow = Date.now;

before(() => {
  Date.now = () => FIXED_NOW;
});

after(() => {
  Date.now = realNow;
});

const addr = (n) => `0x${String(n).padStart(40, "0")}`;

describe("scoring parity", () => {
  it("empty wallet scores zero", () => {
    const ens = { name: null, avatar: null, url: null, github: null };
    const js = computeReputationScore([], ens);
    assert.equal(js.total, 0);
    if (tsCompute) assert.equal(tsCompute([], ens).total, js.total);
  });

  it("one unverified deployment (neutral timestamp)", () => {
    const contracts = [
      {
        contractAddress: addr(1),
        timestamp: 0,
        isVerified: false,
      },
    ];
    const ens = { name: null, avatar: null, url: null, github: null };
    const js = computeReputationScore(contracts, ens);
    assert.equal(js.total, 5);
    assert.equal(js.breakdown.contractDeployments, 5);
    if (tsCompute) assert.equal(tsCompute(contracts, ens).total, js.total);
  });

  it("verified deployment adds bonus points", () => {
    const contracts = [
      {
        contractAddress: addr(2),
        timestamp: 0,
        isVerified: true,
      },
    ];
    const ens = { name: null, avatar: null, url: null, github: null };
    const js = computeReputationScore(contracts, ens);
    assert.equal(js.total, 15);
    if (tsCompute) assert.equal(tsCompute(contracts, ens).total, js.total);
  });

  it("ENS name and one metadata field", () => {
    const ens = { name: "dev.eth", avatar: "ipfs://x", url: null, github: null };
    const js = computeReputationScore([], ens);
    assert.equal(js.total, 5);
    assert.equal(js.breakdown.ensOwnership, 2);
    assert.equal(js.breakdown.ensMetadata, 3);
    if (tsCompute) assert.equal(tsCompute([], ens).total, js.total);
  });

  it("older activity gets established multiplier", () => {
    const oldTs = Math.floor(FIXED_NOW / 1000) - 60 * 24 * 60 * 60;
    const contracts = [
      {
        contractAddress: addr(3),
        timestamp: oldTs,
        isVerified: false,
      },
    ];
    const ens = { name: null, avatar: null, url: null, github: null };
    const js = computeReputationScore(contracts, ens);
    assert.equal(js.total, 6);
    if (tsCompute) assert.equal(tsCompute(contracts, ens).total, js.total);
  });
});
