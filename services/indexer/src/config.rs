use anyhow::Result;
use std::env;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    pub mongo_uri: String,
    pub mongo_db: String,
    pub alchemy_key: String,
    pub etherscan_key: String,
}

impl Config {
    pub fn load() -> Result<Self> {
        load_dotenv();

        let alchemy_key = env::var("ALCHEMY_API_KEY")
            .or_else(|_| env::var("NEXT_PUBLIC_ALCHEMY_API_KEY"))
            .unwrap_or_default();

        Ok(Self {
            mongo_uri: env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".into()),
            mongo_db: env::var("MONGO_DB").unwrap_or_else(|_| "chainfolio".into()),
            alchemy_key,
            etherscan_key: env::var("ETHERSCAN_API_KEY").unwrap_or_default(),
        })
    }
}

fn load_dotenv() {
    let mut dir = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    for _ in 0..5 {
        let candidate = dir.join(".env.local");
        if candidate.exists() {
            let _ = dotenvy::from_path(&candidate);
            return;
        }
        if !dir.pop() {
            break;
        }
    }
}

pub fn alchemy_rpc(chain_id: u32, key: &str) -> Result<String> {
    let host = match chain_id {
        1 => "eth-mainnet",
        11155111 => "eth-sepolia",
        other => anyhow::bail!("no Alchemy RPC configured for chain {other}"),
    };
    if key.is_empty() {
        anyhow::bail!("ALCHEMY_API_KEY / NEXT_PUBLIC_ALCHEMY_API_KEY is not set");
    }
    Ok(format!("https://{host}.g.alchemy.com/v2/{key}"))
}

pub fn etherscan_base(chain_id: u32) -> Result<&'static str> {
    match chain_id {
        1 => Ok("https://api.etherscan.io/api"),
        11155111 => Ok("https://api-sepolia.etherscan.io/api"),
        other => anyhow::bail!("no Etherscan API configured for chain {other}"),
    }
}

pub fn chain_id_from_name(name: &str) -> Result<u32> {
    match name.to_lowercase().as_str() {
        "mainnet" => Ok(1),
        "sepolia" => Ok(11155111),
        other => anyhow::bail!("unsupported chain: {other} (use mainnet or sepolia)"),
    }
}

pub fn chain_name_from_id(chain_id: u32) -> &'static str {
    match chain_id {
        1 => "mainnet",
        11155111 => "sepolia",
        _ => "unknown",
    }
}

pub fn normalize_address(addr: &str) -> Result<String> {
    let a = addr.trim().to_lowercase();
    if a.len() != 42 || !a.starts_with("0x") {
        anyhow::bail!("invalid address: {addr}");
    }
    Ok(a)
}
