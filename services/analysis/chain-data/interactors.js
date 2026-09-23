/**
 * Unique interactor counts via Etherscan txlist.
 */

import { ETHERSCAN_KEY } from "../config.js";
import { fetchJson, buildEtherscanUrl } from "./http.js";

export async function fetchUniqueSenders(contractAddress, etherscanBase) {
  const url = buildEtherscanUrl(etherscanBase, {
    module: "account",
    action: "txlist",
    address: contractAddress,
    startblock: 0,
    endblock: 99999999,
    sort: "asc",
    apikey: ETHERSCAN_KEY,
  });

  const data = await fetchJson(url);
  if (data.status !== "1" || !Array.isArray(data.result)) return new Set();

  return new Set(
    data.result
      .filter((tx) => tx.from && tx.isError === "0")
      .map((tx) => tx.from.toLowerCase()),
  );
}
