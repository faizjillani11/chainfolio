/**
 * ENS resolution — mainnet only. Matches packages/chain-data-spec schema.
 */

import { CHAIN_RPC_URLS } from "../config.js";
import { fetchJson } from "./http.js";

export async function resolveEns(address) {
  try {
    const query = `{
      domains(where: { resolvedAddress: "${address.toLowerCase()}" }, first: 1) {
        name
      }
    }`;

    const resp = await fetchJson("https://api.thegraph.com/subgraphs/name/ensdomains/ens", {
      method: "POST",
      body: JSON.stringify({ query }),
    });

    const domain = resp.data?.domains?.[0];
    if (!domain?.name) return { name: null, avatar: null, url: null, github: null };

    const name = domain.name;
    const rpcUrl = CHAIN_RPC_URLS[1];
    const [avatar, url, github] = await Promise.all([
      fetchEnsText(rpcUrl, name, "avatar"),
      fetchEnsText(rpcUrl, name, "url"),
      fetchEnsText(rpcUrl, name, "com.github"),
    ]);

    return {
      name,
      avatar: avatar || null,
      url: url || null,
      github: github ? github.replace(/^@/, "").split("github.com/").pop() : null,
    };
  } catch (err) {
    console.warn(`[ens] Failed for ${address}: ${err.message}`);
    return { name: null, avatar: null, url: null, github: null };
  }
}

async function fetchEnsText(rpcUrl, name, key) {
  try {
    const node = ensNamehash(name);
    const keyHex = stringToHex(key);
    const keyLen = key.length.toString(16).padStart(64, "0");
    const keyPadded = keyHex.padEnd(Math.ceil(key.length / 32) * 64, "0");
    const data = `0x59d1d43c${node.slice(2)}${"0000000000000000000000000000000000000000000000000000000000000040"}${keyLen}${keyPadded}`;

    const ENS_PUBLIC_RESOLVER = "0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41";
    const resp = await fetchJson(rpcUrl, {
      method: "POST",
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to: ENS_PUBLIC_RESOLVER, data }, "latest"],
      }),
    });

    if (!resp.result || resp.result === "0x") return "";
    return abiDecodeString(resp.result);
  } catch {
    return "";
  }
}

function ensNamehash(name) {
  let node = new Uint8Array(32).fill(0);
  if (!name) return "0x" + Buffer.from(node).toString("hex");

  const labels = name.split(".").reverse();
  for (const label of labels) {
    const labelHash = keccak256(new TextEncoder().encode(label));
    const combined = new Uint8Array(64);
    combined.set(node, 0);
    combined.set(labelHash, 32);
    node = keccak256(combined);
  }
  return "0x" + Buffer.from(node).toString("hex");
}

function keccak256(data) {
  return keccakHash(data);
}

function keccakHash(data) {
  const RC = [
    [0x00000001, 0x00000000], [0x00008082, 0x00000000],
    [0x0000808a, 0x80000000], [0x80008000, 0x80000000],
    [0x0000808b, 0x00000000], [0x80000001, 0x00000000],
    [0x80008081, 0x80000000], [0x00008009, 0x80000000],
    [0x0000008a, 0x00000000], [0x00000088, 0x00000000],
    [0x80008009, 0x00000000], [0x8000000a, 0x00000000],
    [0x8000808b, 0x00000000], [0x0000008b, 0x80000000],
    [0x00008089, 0x80000000], [0x00008003, 0x80000000],
    [0x00008002, 0x80000000], [0x00000080, 0x80000000],
    [0x0000800a, 0x00000000], [0x8000000a, 0x80000000],
    [0x80008081, 0x80000000], [0x00008080, 0x80000000],
    [0x80000001, 0x00000000], [0x80008008, 0x80000000],
  ];

  const rate = 136;
  const padded = new Uint8Array(Math.ceil((data.length + 1) / rate) * rate);
  padded.set(data);
  padded[data.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  const state = Array.from({ length: 25 }, () => [0, 0]);

  for (let block = 0; block < padded.length; block += rate) {
    for (let i = 0; i < rate / 8; i++) {
      const off = block + i * 8;
      state[i][0] ^= (padded[off] | (padded[off + 1] << 8) | (padded[off + 2] << 16) | (padded[off + 3] << 24)) >>> 0;
      state[i][1] ^= (padded[off + 4] | (padded[off + 5] << 8) | (padded[off + 6] << 16) | (padded[off + 7] << 24)) >>> 0;
    }
    keccakF(state, RC);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    const [lo, hi] = state[i];
    out[i * 8 + 0] = lo & 0xff;
    out[i * 8 + 1] = (lo >>> 8) & 0xff;
    out[i * 8 + 2] = (lo >>> 16) & 0xff;
    out[i * 8 + 3] = (lo >>> 24) & 0xff;
    out[i * 8 + 4] = hi & 0xff;
    out[i * 8 + 5] = (hi >>> 8) & 0xff;
    out[i * 8 + 6] = (hi >>> 16) & 0xff;
    out[i * 8 + 7] = (hi >>> 24) & 0xff;
  }
  return out;
}

function keccakF(state, RC) {
  const rot32 = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;

  for (let round = 0; round < 24; round++) {
    const C = Array.from({ length: 5 }, (_, x) => [
      state[x][0] ^ state[x + 5][0] ^ state[x + 10][0] ^ state[x + 15][0] ^ state[x + 20][0],
      state[x][1] ^ state[x + 5][1] ^ state[x + 10][1] ^ state[x + 15][1] ^ state[x + 20][1],
    ]);
    const D = Array.from({ length: 5 }, (_, x) => {
      const x1 = (x + 1) % 5;
      const lo = C[(x + 4) % 5][0] ^ (rot32(C[x1][0], 1) ^ (C[x1][1] >>> 31));
      const hi = C[(x + 4) % 5][1] ^ (rot32(C[x1][1], 1) ^ (C[x1][0] >>> 31));
      return [lo >>> 0, hi >>> 0];
    });
    for (let i = 0; i < 25; i++) {
      state[i][0] = (state[i][0] ^ D[i % 5][0]) >>> 0;
      state[i][1] = (state[i][1] ^ D[i % 5][1]) >>> 0;
    }

    const B = Array.from({ length: 25 }, () => [0, 0]);
    const ROTS = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
    const PI = [0, 10, 20, 5, 15, 1, 11, 21, 6, 16, 2, 12, 22, 7, 17, 3, 13, 23, 8, 18, 4, 14, 24, 9, 19];
    for (let i = 0; i < 25; i++) {
      const r = ROTS[i];
      const [lo, hi] = state[i];
      let rlo, rhi;
      if (r === 0) {
        rlo = lo;
        rhi = hi;
      } else if (r < 32) {
        rlo = ((lo << r) | (hi >>> (32 - r))) >>> 0;
        rhi = ((hi << r) | (lo >>> (32 - r))) >>> 0;
      } else {
        const s = r - 32;
        rlo = ((hi << s) | (lo >>> (32 - s))) >>> 0;
        rhi = ((lo << s) | (hi >>> (32 - s))) >>> 0;
      }
      B[PI[i]] = [rlo, rhi];
    }

    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const i = y * 5 + x;
        state[i][0] = (B[i][0] ^ (~B[y * 5 + (x + 1) % 5][0] & B[y * 5 + (x + 2) % 5][0])) >>> 0;
        state[i][1] = (B[i][1] ^ (~B[y * 5 + (x + 1) % 5][1] & B[y * 5 + (x + 2) % 5][1])) >>> 0;
      }
    }

    state[0][0] = (state[0][0] ^ RC[round][0]) >>> 0;
    state[0][1] = (state[0][1] ^ RC[round][1]) >>> 0;
  }
}

function stringToHex(str) {
  return Buffer.from(str, "utf8").toString("hex");
}

function abiDecodeString(hex) {
  try {
    const data = hex.startsWith("0x") ? hex.slice(2) : hex;
    const offset = parseInt(data.slice(0, 64), 16) * 2;
    const length = parseInt(data.slice(offset, offset + 64), 16);
    const strHex = data.slice(offset + 64, offset + 64 + length * 2);
    return Buffer.from(strHex, "hex").toString("utf8");
  } catch {
    return "";
  }
}
