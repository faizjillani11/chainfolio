/**
 * Contract deployment detection — Alchemy primary, Etherscan fallback.
 * Implements packages/chain-data-spec/schema.json → ContractDeploymentRaw
 */

import { CHAIN_RPC_URLS, ETHERSCAN_URLS, ETHERSCAN_KEY } from "../config.js";
import { fetchJson, buildEtherscanUrl } from "./http.js";

export async function fetchDeployments(address, chainId) {
  let alchemyFailed = false;

  try {
    const contracts = await alchemyGetDeployments(address, chainId);
    if (contracts.length > 0) return { contracts, alchemyFailed: false };
  } catch (err) {
    console.warn(`[deployments] Alchemy failed: ${err.message}`);
    alchemyFailed = true;
  }

  try {
    const contracts = await etherscanGetDeployments(address, chainId);
    return { contracts, alchemyFailed };
  } catch (err) {
    console.warn(`[deployments] Etherscan fallback failed: ${err.message}`);
    return { contracts: [], alchemyFailed: true };
  }
}

async function alchemyGetDeployments(address, chainId) {
  const rpcUrl = CHAIN_RPC_URLS[chainId];
  if (!rpcUrl) throw new Error(`No RPC URL configured for chain ${chainId}`);

  const transfersResp = await fetchJson(rpcUrl, {
    method: "POST",
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "alchemy_getAssetTransfers",
      params: [{
        fromAddress: address,
        category: ["external"],
        withMetadata: true,
        excludeZeroValue: false,
        maxCount: "0x3E8",
      }],
    }),
  });

  if (transfersResp.error) throw new Error(transfersResp.error.message);

  const transfers = transfersResp.result?.transfers ?? [];
  const deployTxs = transfers.filter((tx) => tx.to === null);
  const contracts = [];

  for (const tx of deployTxs) {
    const receiptResp = await fetchJson(rpcUrl, {
      method: "POST",
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [tx.hash],
      }),
    });

    const receipt = receiptResp.result;
    if (receipt?.contractAddress) {
      const tsStr = tx.metadata?.blockTimestamp ?? "";
      const timestamp = tsStr ? Math.floor(new Date(tsStr).getTime() / 1000) : 0;
      contracts.push({
        contract_address: receipt.contractAddress.toLowerCase(),
        transaction_hash: tx.hash,
        block_number: parseInt(tx.blockNum, 16),
        timestamp,
        is_verified: false,
      });
    }
  }

  return contracts;
}

async function etherscanGetDeployments(address, chainId) {
  const base = ETHERSCAN_URLS[chainId] ?? ETHERSCAN_URLS[1];
  const url = buildEtherscanUrl(base, {
    module: "account",
    action: "txlist",
    address,
    startblock: 0,
    endblock: 99999999,
    sort: "asc",
    apikey: ETHERSCAN_KEY,
  });

  const data = await fetchJson(url);
  if (data.status !== "1") return [];

  return data.result
    .filter((tx) => tx.to === "" && tx.contractAddress && tx.isError === "0")
    .map((tx) => ({
      contract_address: tx.contractAddress.toLowerCase(),
      transaction_hash: tx.hash,
      block_number: parseInt(tx.blockNumber, 10),
      timestamp: parseInt(tx.timeStamp, 10),
      is_verified: false,
    }));
}
