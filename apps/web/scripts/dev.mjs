/**
 * Web dev launcher — removes .next before every start so compiles stay fresh.
 */

import { spawn } from "child_process";
import { createRequire } from "module";
import { existsSync, rmSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(__dirname, "..");
const nextDir = resolve(webDir, ".next");
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

function cleanNextCache() {
  if (!existsSync(nextDir)) return;
  process.stdout.write("[web] Removing .next…\n");
  rmSync(nextDir, { recursive: true, force: true });
}

cleanNextCache();

const child = spawn(process.execPath, [nextBin, "dev"], {
  cwd: webDir,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
