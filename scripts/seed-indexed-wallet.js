/**
 * Backfill indexed deployment data for one wallet (pre-Rust indexer).
 *
 * Fetches live from Alchemy/Etherscan, writes to MongoDB index collections,
 * then analysis will use source=indexed on the next run.
 *
 * Usage:
 *   node scripts/seed-indexed-wallet.js 0xYourAddress mainnet
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chainIdFromNetwork } from "../services/analysis/config.js";
import { ensureIndexes } from "../services/analysis/db.js";
import { fetchDeployments } from "../services/analysis/chain-data/deployments.js";
import { enrichVerification } from "../services/analysis/chain-data/verification.js";
import {
  upsertContractDeployments,
  upsertContractVerification,
  markWalletIndexed,
} from "../services/analysis/chain-data/read.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const address = process.argv[2];
const network = process.argv[3] ?? "mainnet";

if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.error("Usage: node scripts/seed-indexed-wallet.js 0xAddress [mainnet|sepolia]");
  process.exit(1);
}

const chainId = chainIdFromNetwork(network);
const wallet = address.toLowerCase();

await ensureIndexes();

console.info(`[seed] Fetching live deployments for ${wallet} on ${network}…`);
const { contracts } = await fetchDeployments(wallet, chainId);

if (contracts.length === 0) {
  await markWalletIndexed(wallet, chainId, 0);
  console.info(`[seed] Marked ${wallet} as indexed with 0 deployments`);
  process.exit(0);
}

const enriched = await enrichVerification(contracts, chainId);
await upsertContractDeployments(wallet, chainId, enriched);

for (const row of enriched) {
  await upsertContractVerification(chainId, row.contract_address, row.is_verified);
}

console.info(`[seed] Indexed ${enriched.length} deployment(s) for ${wallet} on ${network}`);
console.info("[seed] Re-run analysis — logs should show [chain-data] source=indexed");
