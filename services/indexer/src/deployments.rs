use anyhow::{Context, Result};
use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;

use crate::config::{alchemy_rpc, etherscan_base, Config};

#[derive(Clone, Debug)]
pub struct RawDeployment {
    pub contract_address: String,
    pub transaction_hash: String,
    pub block_number: i64,
    pub timestamp: i64,
}

pub async fn fetch_deployments(
    cfg: &Config,
    client: &Client,
    wallet: &str,
    chain_id: u32,
) -> Result<Vec<RawDeployment>> {
    match fetch_alchemy(client, cfg, wallet, chain_id).await {
        Ok(list) if !list.is_empty() => return Ok(list),
        Ok(_) => {}
        Err(err) => eprintln!("[indexer] Alchemy failed: {err:#}"),
    }

    fetch_etherscan(client, cfg, wallet, chain_id).await
}

async fn fetch_alchemy(
    client: &Client,
    cfg: &Config,
    wallet: &str,
    chain_id: u32,
) -> Result<Vec<RawDeployment>> {
    let rpc = alchemy_rpc(chain_id, &cfg.alchemy_key)?;

    let body = json!({
        "id": 1,
        "jsonrpc": "2.0",
        "method": "alchemy_getAssetTransfers",
        "params": [{
            "fromAddress": wallet,
            "category": ["external"],
            "withMetadata": true,
            "excludeZeroValue": false,
            "maxCount": "0x3E8"
        }]
    });

    let resp: Value = client
        .post(&rpc)
        .json(&body)
        .send()
        .await
        .context("alchemy_getAssetTransfers request")?
        .error_for_status()
        .context("alchemy HTTP error")?
        .json()
        .await?;

    if let Some(err) = resp.get("error") {
        anyhow::bail!("alchemy RPC error: {err}");
    }

    let transfers = resp
        .pointer("/result/transfers")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();

    for tx in transfers {
        if tx.get("to").map(|v| !v.is_null()).unwrap_or(true) {
            continue;
        }

        let hash = tx
            .get("hash")
            .and_then(|v| v.as_str())
            .context("transfer missing hash")?;

        let receipt_body = json!({
            "id": 1,
            "jsonrpc": "2.0",
            "method": "eth_getTransactionReceipt",
            "params": [hash]
        });

        let receipt_resp: Value = client.post(&rpc).json(&receipt_body).send().await?.json().await?;
        let contract = receipt_resp
            .pointer("/result/contractAddress")
            .and_then(|v| v.as_str())
            .map(|s| s.to_lowercase());

        let Some(contract_address) = contract else { continue };

        let block_num = tx
            .get("blockNum")
            .and_then(|v| v.as_str())
            .and_then(|hex| i64::from_str_radix(hex.trim_start_matches("0x"), 16).ok())
            .unwrap_or(0);

        let timestamp = tx
            .pointer("/metadata/blockTimestamp")
            .and_then(|v| v.as_str())
            .and_then(parse_timestamp)
            .unwrap_or(0);

        out.push(RawDeployment {
            contract_address,
            transaction_hash: hash.to_string(),
            block_number: block_num,
            timestamp,
        });
    }

    Ok(out)
}

async fn fetch_etherscan(
    client: &Client,
    cfg: &Config,
    wallet: &str,
    chain_id: u32,
) -> Result<Vec<RawDeployment>> {
    let base = etherscan_base(chain_id)?;
    let url = format!(
        "{base}?module=account&action=txlist&address={wallet}&startblock=0&endblock=99999999&sort=asc&apikey={}",
        cfg.etherscan_key
    );

    let resp: Value = client.get(&url).send().await?.json().await?;
    if resp.get("status").and_then(|v| v.as_str()) != Some("1") {
        return Ok(vec![]);
    }

    let rows = resp.get("result").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let mut out = Vec::new();

    for tx in rows {
        let to = tx.get("to").and_then(|v| v.as_str()).unwrap_or("");
        let is_error = tx.get("isError").and_then(|v| v.as_str()).unwrap_or("1");
        let contract = tx.get("contractAddress").and_then(|v| v.as_str());

        if !to.is_empty() || contract.is_none() || is_error != "0" {
            continue;
        }

        out.push(RawDeployment {
            contract_address: contract.unwrap().to_lowercase(),
            transaction_hash: tx.get("hash").and_then(|v| v.as_str()).unwrap_or("").into(),
            block_number: tx
                .get("blockNumber")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
            timestamp: tx
                .get("timeStamp")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
        });
    }

    Ok(out)
}

fn parse_timestamp(raw: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|dt| dt.timestamp())
}

pub async fn sleep_ms(ms: u64) {
    tokio::time::sleep(Duration::from_millis(ms)).await;
}
