use anyhow::Result;
use reqwest::Client;
use serde_json::Value;

use crate::config::{etherscan_base, Config};
use crate::deployments::{sleep_ms, RawDeployment};

pub async fn enrich_verification(
    cfg: &Config,
    client: &Client,
    chain_id: u32,
    rows: &[RawDeployment],
) -> Result<Vec<(RawDeployment, bool)>> {
    let base = etherscan_base(chain_id)?;
    let mut out = Vec::with_capacity(rows.len());

    for (i, row) in rows.iter().enumerate() {
        let verified = check_verified(client, cfg, base, &row.contract_address).await?;
        out.push((row.clone(), verified));

        if (i + 1) % 5 == 0 && i + 1 < rows.len() {
            sleep_ms(250).await;
        }
    }

    Ok(out)
}

pub async fn check_contract_verified(
    client: &Client,
    cfg: &Config,
    chain_id: u32,
    address: &str,
) -> Result<bool> {
    let base = etherscan_base(chain_id)?;
    check_verified(client, cfg, base, address).await
}

async fn check_verified(
    client: &Client,
    cfg: &Config,
    base: &str,
    address: &str,
) -> Result<bool> {
    let url = format!(
        "{base}?module=contract&action=getsourcecode&address={address}&apikey={}",
        cfg.etherscan_key
    );

    let resp: Value = client.get(&url).send().await?.json().await?;
    if resp.get("status").and_then(|v| v.as_str()) != Some("1") {
        return Ok(false);
    }

    let entry = resp
        .get("result")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first());

    let Some(src) = entry else {
        return Ok(false);
    };

    let source = src.get("SourceCode").and_then(|v| v.as_str()).unwrap_or("");
    let abi = src.get("ABI").and_then(|v| v.as_str()).unwrap_or("");

    Ok(!source.is_empty() && source != "1" && abi != "Contract source code not verified")
}
