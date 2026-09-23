/**
 * Contract normalizer for the worker pipeline.
 * Contract normalization for the worker pipeline.
 */

export function normalizeContract(raw) {
  const addr = (raw.contractAddress ?? raw.contract_address ?? "")
    .toLowerCase()
    .trim();

  return {
    contractAddress: addr,
    transactionHash: raw.transactionHash ?? raw.transaction_hash ?? "",
    blockNumber:
      typeof raw.blockNumber === "number" && raw.blockNumber >= 0
        ? raw.blockNumber
        : typeof raw.block_number === "number" && raw.block_number >= 0
          ? raw.block_number
          : 0,
    timestamp:
      typeof raw.timestamp === "number" && raw.timestamp > 0 ? raw.timestamp : 0,
    isVerified: raw.isVerified === true || raw.is_verified === true,
  };
}

export function normalizeContracts(rawList) {
  return rawList
    .map(normalizeContract)
    .filter((c) => c.contractAddress.length === 42 && c.contractAddress.startsWith("0x"));
}

export function deduplicateContracts(contracts) {
  const seen = new Map();

  for (const contract of contracts) {
    const existing = seen.get(contract.contractAddress);
    if (!existing) {
      seen.set(contract.contractAddress, contract);
      continue;
    }

    const keepExisting =
      existing.timestamp > 0 &&
      (contract.timestamp === 0 || existing.timestamp <= contract.timestamp);

    if (!keepExisting) {
      seen.set(contract.contractAddress, contract);
    }
  }

  return Array.from(seen.values());
}
