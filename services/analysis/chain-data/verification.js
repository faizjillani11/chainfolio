/**
 * Etherscan contract verification checks (batched, rate-limit safe).
 */

import { ETHERSCAN_URLS, ETHERSCAN_KEY } from "../config.js";
import { fetchJson, buildEtherscanUrl, sleep } from "./http.js";

export async function enrichVerification(contractsRaw, chainId, batchSize = 5, delayMs = 250) {
  const base = ETHERSCAN_URLS[chainId] ?? ETHERSCAN_URLS[1];
  const enriched = [];

  for (let i = 0; i < contractsRaw.length; i += batchSize) {
    const batch = contractsRaw.slice(i, i + batchSize);

    for (const raw of batch) {
      let isVerified = false;
      try {
        const url = buildEtherscanUrl(base, {
          module: "contract",
          action: "getsourcecode",
          address: raw.contract_address,
          apikey: ETHERSCAN_KEY,
        });
        const data = await fetchJson(url);
        if (data.status === "1" && data.result?.length) {
          const src = data.result[0];
          isVerified = Boolean(
            src.SourceCode &&
            src.SourceCode !== "" &&
            src.SourceCode !== "1" &&
            src.ABI !== "Contract source code not verified",
          );
        }
      } catch (err) {
        console.debug(`[verification] Failed for ${raw.contract_address}: ${err.message}`);
      }

      enriched.push({ ...raw, is_verified: isVerified });
    }

    if (i + batchSize < contractsRaw.length) {
      await sleep(delayMs);
    }
  }

  return enriched;
}
