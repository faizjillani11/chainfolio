/**
 * Dev launcher — starts the worker API, worker process, and Next.js
 * in order from a single `npm run dev` command.
 *
 * No Docker. Uses Node built-ins only.
 */

import { spawn } from "child_process";
import { existsSync, rmSync } from "fs";
import net from "net";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const webDir = resolve(root, "apps/web");
const nextDir = resolve(webDir, ".next");

const RESET = "\x1b[0m";
const COLORS = {
  next: "\x1b[36m",
  api: "\x1b[33m",
  worker: "\x1b[32m",
  dev: "\x1b[35m",
};

const HEALTH_RETRIES = 30;
const HEALTH_INTERVAL_MS = 500;
const DEFAULT_API_PORT = 8000;
const PORT_SCAN_RANGE = 20;

/** @type {string} */
let workerUrl = process.env.WORKER_URL ?? `http://127.0.0.1:${DEFAULT_API_PORT}`;

/** @type {import('child_process').ChildProcess[]} */
const children = [];

function prefix(name) {
  const color = COLORS[name] ?? RESET;
  return `${color}[${name}]${RESET} `.padEnd(18);
}

function pipe(name, stream) {
  stream.setEncoding("utf8");
  let buf = "";
  stream.on("data", (chunk) => {
    buf += chunk;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length) process.stdout.write(prefix(name) + line + "\n");
    }
  });
}

function spawnProc(name, cmd, args, cwd = root, extraEnv = {}) {
  const child = spawn(cmd, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...extraEnv },
  });

  pipe(name, child.stdout);
  pipe(name, child.stderr);

  child.on("exit", (code, signal) => {
    if (signal !== "SIGTERM" && signal !== "SIGINT") {
      process.stdout.write(prefix("dev") + `${name} exited (${code ?? signal})\n`);
    }
  });

  children.push(child);
  return child;
}

function runSync(label, cmd, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: "inherit", env: process.env });
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${label} failed with code ${code}`));
    });
  });
}

function isPortFree(port, host = "127.0.0.1") {
  return new Promise((resolvePort) => {
    const server = net.createServer();
    server.once("error", () => resolvePort(false));
    server.once("listening", () => server.close(() => resolvePort(true)));
    server.listen(port, host);
  });
}

/**
 * Pick an API port. If WORKER_URL is set explicitly, honor it; otherwise scan upward from PORT/8000.
 * @returns {Promise<{ port: number, workerUrl: string }>}
 */
async function resolveApiPort() {
  const preferred = parseInt(process.env.PORT ?? String(DEFAULT_API_PORT), 10);

  if (process.env.WORKER_URL) {
    const url = new URL(process.env.WORKER_URL);
    const port = parseInt(url.port || String(preferred), 10);
    if (!(await isPortFree(port))) {
      throw new Error(
        `Port ${port} is in use (WORKER_URL=${process.env.WORKER_URL}). ` +
          "Stop the other process or change PORT / WORKER_URL in .env.local.",
      );
    }
    return { port, workerUrl: process.env.WORKER_URL };
  }

  for (let port = preferred; port < preferred + PORT_SCAN_RANGE; port++) {
    if (await isPortFree(port)) {
      if (port !== preferred) {
        process.stdout.write(
          prefix("dev") +
            `Port ${preferred} in use — analysis API will use ${port}\n`,
        );
      }
      return { port, workerUrl: `http://127.0.0.1:${port}` };
    }
  }

  throw new Error(
    `No free port between ${preferred} and ${preferred + PORT_SCAN_RANGE - 1}. ` +
      "Stop conflicting processes or set PORT / WORKER_URL in .env.local.",
  );
}

async function waitForWorkerApi() {
  for (let i = 0; i < HEALTH_RETRIES; i++) {
    try {
      const res = await fetch(`${workerUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        process.stdout.write(prefix("dev") + `Worker API is up (${workerUrl})\n`);
        return;
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS));
  }
  throw new Error(
    `Worker API did not respond at ${workerUrl}/health — check analysis API logs above.`,
  );
}

function cleanNextCache() {
  if (!existsSync(nextDir)) return;
  process.stdout.write(prefix("dev") + "Removing apps/web/.next…\n");
  rmSync(nextDir, { recursive: true, force: true });
}

function shutdown() {
  for (const child of children) {
    child.kill("SIGTERM");
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
  process.stdout.write(prefix("dev") + "Preflight checks…\n");
  await runSync("check-env", "node", ["scripts/check-env.js"]);
  await runSync("generate-scoring", "node", ["packages/scoring-spec/generate.js"]);

  const { port, workerUrl: resolvedUrl } = await resolveApiPort();
  workerUrl = resolvedUrl;
  const apiEnv = { PORT: String(port), WORKER_URL: workerUrl };
  const webEnv = { WORKER_URL: workerUrl };

  process.stdout.write(prefix("dev") + "Starting analysis API…\n");
  spawnProc("api", "node", ["services/analysis/api.js"], root, apiEnv);

  await waitForWorkerApi();

  process.stdout.write(prefix("dev") + "Starting analysis worker…\n");
  spawnProc("worker", "node", ["services/analysis/worker.js"], root, webEnv);

  await new Promise((r) => setTimeout(r, 800));

  cleanNextCache();

  process.stdout.write(prefix("dev") + "Starting Next.js…\n");
  spawnProc(
    "next",
    "node",
    [resolve(root, "node_modules/.bin/next"), "dev"],
    webDir,
    webEnv,
  );

  process.stdout.write(prefix("dev") + "All services running (Ctrl+C to stop)\n");
}

main().catch((err) => {
  console.error(prefix("dev") + err.message);
  shutdown();
});
