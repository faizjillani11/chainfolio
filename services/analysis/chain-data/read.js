/**
 * DB-first chain data reads.
 * Implements packages/chain-data-spec/schema.json storage layout.
 *
 * Returns source=null when the wallet has not been indexed — caller should
 * fall back to live API fetchers in chain-data/deployments.js.
 */

import { getDb } from "../db.js";

/**
 * @param {string} deployerAddress
 * @param {number} chainId
 * @returns {Promise<{
 *   source: "indexed" | null,
 *   contracts: Array<{
 *     contract_address: string,
 *     transaction_hash: string,
 *     block_number: number,
 *     timestamp: number,
 *     is_verified: boolean,
 *   }>,
 *   verificationIncomplete: boolean,
 * }>}
 */
export async function getDeploymentsForWallet(deployerAddress, chainId) {
  const empty = { source: null, contracts: [], verificationIncomplete: false };

  const db = await getDb();
  if (!db) return empty;

  const deployer = deployerAddress.toLowerCase();

  try {
    const walletDoc = await db.collection("wallet_deployments").findOne({
      chain_id: chainId,
      deployer_address: deployer,
    });

    if (!walletDoc) return empty;

    const deployments = await db
      .collection("contract_deployments")
      .find({ chain_id: chainId, deployer_address: deployer })
      .sort({ timestamp: 1, block_number: 1 })
      .toArray();

    const addresses = deployments.map((d) => d.contract_address);
    const verifications =
      addresses.length > 0
        ? await db
            .collection("contract_verifications")
            .find({
              chain_id: chainId,
              contract_address: { $in: addresses },
            })
            .toArray()
        : [];

    const verMap = new Map(
      verifications.map((v) => [v.contract_address, v.is_verified === true]),
    );

    const contracts = deployments.map((d) => ({
      contract_address: d.contract_address,
      transaction_hash: d.transaction_hash ?? "",
      block_number: typeof d.block_number === "number" ? d.block_number : 0,
      timestamp: typeof d.timestamp === "number" ? d.timestamp : 0,
      is_verified: verMap.get(d.contract_address) ?? false,
    }));

    const verificationIncomplete =
      contracts.length > 0 &&
      contracts.some((c) => !verMap.has(c.contract_address));

    console.info(
      `[chain-data] source=indexed wallet=${deployer} chain=${chainId} count=${contracts.length}`,
    );

    return {
      source: "indexed",
      contracts,
      verificationIncomplete,
    };
  } catch (err) {
    console.warn(`[chain-data] indexed read failed: ${err.message}`);
    return empty;
  }
}

/**
 * Mark a wallet as indexed with zero deployments (used by indexer / seed scripts).
 * @returns {Promise<boolean>}
 */
export async function markWalletIndexed(deployerAddress, chainId, contractCount = 0) {
  const db = await getDb();
  if (!db) return false;

  const deployer = deployerAddress.toLowerCase();
  const now = new Date();

  try {
    await db.collection("wallet_deployments").updateOne(
      { chain_id: chainId, deployer_address: deployer },
      {
        $set: {
          chain_id: chainId,
          deployer_address: deployer,
          contract_count: contractCount,
          indexed_at: now,
          updated_at: now,
        },
      },
      { upsert: true },
    );
    return true;
  } catch (err) {
    console.warn(`[chain-data] markWalletIndexed failed: ${err.message}`);
    return false;
  }
}

/**
 * Upsert indexed deployment rows (indexer or seed scripts).
 * @param {string} deployerAddress
 * @param {number} chainId
 * @param {Array<object>} rows
 * @returns {Promise<boolean>}
 */
export async function upsertContractDeployments(deployerAddress, chainId, rows) {
  const db = await getDb();
  if (!db) return false;

  const deployer = deployerAddress.toLowerCase();
  const now = new Date();

  try {
    for (const row of rows) {
      const contract_address = (row.contract_address ?? row.contractAddress).toLowerCase();
      await db.collection("contract_deployments").updateOne(
        { chain_id: chainId, contract_address },
        {
          $set: {
            chain_id: chainId,
            contract_address,
            deployer_address: deployer,
            transaction_hash: row.transaction_hash ?? row.transactionHash ?? "",
            block_number: row.block_number ?? row.blockNumber ?? 0,
            timestamp: row.timestamp ?? 0,
            indexed_at: now,
          },
        },
        { upsert: true },
      );
    }

    await markWalletIndexed(deployer, chainId, rows.length);
    return true;
  } catch (err) {
    console.warn(`[chain-data] upsertContractDeployments failed: ${err.message}`);
    return false;
  }
}

/**
 * Upsert verification status for a contract (indexer or live backfill).
 * @returns {Promise<boolean>}
 */
export async function upsertContractVerification(chainId, contractAddress, isVerified) {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.collection("contract_verifications").updateOne(
      {
        chain_id: chainId,
        contract_address: contractAddress.toLowerCase(),
      },
      {
        $set: {
          chain_id: chainId,
          contract_address: contractAddress.toLowerCase(),
          is_verified: isVerified === true,
          checked_at: new Date(),
        },
      },
      { upsert: true },
    );
    return true;
  } catch (err) {
    console.warn(`[chain-data] upsertContractVerification failed: ${err.message}`);
    return false;
  }
}
