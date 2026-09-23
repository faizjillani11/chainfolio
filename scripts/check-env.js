/**
 * Validates env vars before starting dev services.
 * Missing API keys → demo mode (warn, do not exit).
 */

import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { isMockMode } from "../services/analysis/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFile() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile();

const required = [
  {
    key: "NEXT_PUBLIC_ALCHEMY_API_KEY",
    hint: "Get a key at https://dashboard.alchemy.com",
  },
  {
    key: "ETHERSCAN_API_KEY",
    hint: "Get a key at https://etherscan.io/myapikey",
  },
];

const recommended = [
  "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
  "MONGO_URI",
];

function isMissingKey(key) {
  const val = process.env[key];
  return !val || val.includes("your_") || val.includes("_here");
}

const demoMode = isMockMode();
let failed = false;

for (const { key, hint } of required) {
  if (isMissingKey(key)) {
    if (demoMode) {
      console.warn(`[check-env] Demo mode — missing: ${key}`);
    } else {
      console.error(`[check-env] Missing or placeholder: ${key}`);
      console.error(`              ${hint}`);
      failed = true;
    }
  }
}

for (const key of recommended) {
  if (!process.env[key]) {
    console.warn(`[check-env] Optional not set: ${key}`);
  }
}

if (!existsSync(resolve(root, ".env.local"))) {
  console.warn("[check-env] No .env.local — demo mode uses sample analysis data");
}

if (failed) {
  process.exit(1);
}

if (demoMode) {
  console.info("[check-env] OK (demo mode — add API keys to .env.local for live analysis)");
} else {
  console.info("[check-env] OK");
}
