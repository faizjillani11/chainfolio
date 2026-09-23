/**
 * Shared HTTP helpers for chain-data fetchers.
 */

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers ?? {}) };
  const resp = await fetch(url, { ...options, headers });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  return resp.json();
}

export function buildEtherscanUrl(base, params) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}
