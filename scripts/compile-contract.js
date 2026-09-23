/**
 * Compile Chainfolio.sol and write artifacts/Chainfolio.json
 *
 * Requires solc on PATH: https://docs.soliditylang.org/en/latest/installing-solidity.html
 *
 * Usage: npm run onchain:compile
 */

import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = resolve(root, "artifacts");
const contractPath = resolve(root, "contracts/Chainfolio.sol");
const outPath = resolve(artifactsDir, "Chainfolio.json");

try {
  execSync("solc --version", { stdio: "ignore" });
} catch {
  console.error(
    "solc not found. Install Solidity compiler, then re-run:\n" +
      "  npm run onchain:compile"
  );
  process.exit(1);
}

mkdirSync(artifactsDir, { recursive: true });

const output = execSync(
  `solc --combined-json abi,bin --optimize --base-path ${root} ${contractPath}`,
  { cwd: root, encoding: "utf8" }
);

const combined = JSON.parse(output);
const key = Object.keys(combined.contracts).find((k) =>
  k.endsWith("Chainfolio.sol:Chainfolio")
);

if (!key) {
  console.error("Chainfolio contract not found in solc output");
  process.exit(1);
}

const { abi, bin } = combined.contracts[key];
writeFileSync(outPath, JSON.stringify({ abi: JSON.parse(abi), bytecode: `0x${bin}` }, null, 2));

console.info(`[onchain:compile] Wrote ${outPath}`);
