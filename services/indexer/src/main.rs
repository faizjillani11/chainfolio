mod config;
mod deployments;
mod store;
mod verification;

use std::time::Duration;

use anyhow::Result;
use clap::{Parser, Subcommand};
use reqwest::Client;

use config::{chain_id_from_name, chain_name_from_id, normalize_address, Config};
use deployments::fetch_deployments;
use store::Store;
use verification::{check_contract_verified, enrich_verification};

#[derive(Parser)]
#[command(name = "chainfolio-indexer")]
#[command(about = "Indexes contract deployments into MongoDB for Chainfolio")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Fetch deployments for one wallet and write to the index collections
    Backfill {
        #[arg(long)]
        wallet: String,
        #[arg(long, default_value = "mainnet")]
        chain: String,
    },
    /// Continuously refresh all indexed wallets (or env INDEXER_WATCH_WALLETS)
    Watch {
        #[arg(long, default_value = "300")]
        interval_secs: u64,
        #[arg(long)]
        chain: Option<String>,
    },
    /// Re-check Etherscan verification for stale contract_verifications rows
    Reverify {
        #[arg(long, default_value = "168")]
        max_age_hours: u64,
        #[arg(long, default_value = "mainnet")]
        chain: String,
    },
}

async fn run_backfill(
    cfg: &Config,
    client: &Client,
    store: &Store,
    wallet: &str,
    chain_id: u32,
    chain_label: &str,
) -> Result<()> {
    let wallet = normalize_address(wallet)?;
    println!("[indexer] backfill wallet={wallet} chain={chain_label} ({chain_id})");

    let rows = fetch_deployments(cfg, client, &wallet, chain_id).await?;

    if rows.is_empty() {
        store.mark_empty_wallet(chain_id, &wallet).await?;
        println!("[indexer] marked {wallet} indexed with 0 deployments");
        return Ok(());
    }

    let enriched = enrich_verification(cfg, client, chain_id, &rows).await?;
    store.save_backfill(chain_id, &wallet, &enriched).await?;

    println!(
        "[indexer] indexed {} deployment(s) for {wallet} on {chain_label}",
        enriched.len()
    );
    Ok(())
}

fn watch_wallets_from_env() -> Vec<(String, String)> {
    let raw = std::env::var("INDEXER_WATCH_WALLETS").unwrap_or_default();
    raw.split(',')
        .filter_map(|entry| {
            let entry = entry.trim();
            if entry.is_empty() {
                return None;
            }
            let parts: Vec<&str> = entry.split(':').collect();
            if parts.len() == 2 {
                Some((parts[0].to_string(), parts[1].to_string()))
            } else {
                Some((entry.to_string(), "mainnet".to_string()))
            }
        })
        .collect()
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let cfg = Config::load()?;
    let client = Client::new();
    let store = Store::connect(&cfg).await?;

    match cli.command {
        Commands::Backfill { wallet, chain } => {
            let chain_id = chain_id_from_name(&chain)?;
            run_backfill(&cfg, &client, &store, &wallet, chain_id, &chain).await?;
            println!("[indexer] analysis should log: [chain-data] source=indexed");
        }

        Commands::Watch { interval_secs, chain } => {
            let chain_filter = chain
                .as_ref()
                .map(|c| chain_id_from_name(c))
                .transpose()?;

            println!(
                "[indexer] watch started interval={interval_secs}s chain={}",
                chain.as_deref().unwrap_or("all")
            );

            loop {
                let mut targets: Vec<(u32, String)> = store.list_wallets(chain_filter).await?;

                for (wallet, net) in watch_wallets_from_env() {
                    let cid = chain_id_from_name(&net)?;
                    if chain_filter.is_some_and(|f| f != cid) {
                        continue;
                    }
                    if !targets.iter().any(|(c, w)| *c == cid && w == &wallet.to_lowercase()) {
                        targets.push((cid, wallet.to_lowercase()));
                    }
                }

                if targets.is_empty() {
                    println!("[indexer] watch: no wallets to refresh (backfill or set INDEXER_WATCH_WALLETS)");
                }

                for (chain_id, wallet) in targets {
                    let label = chain_name_from_id(chain_id);
                    if let Err(err) = run_backfill(
                        &cfg,
                        &client,
                        &store,
                        &wallet,
                        chain_id,
                        label,
                    )
                    .await
                    {
                        eprintln!("[indexer] watch backfill failed wallet={wallet}: {err}");
                    }
                }

                tokio::time::sleep(Duration::from_secs(interval_secs)).await;
            }
        }

        Commands::Reverify {
            max_age_hours,
            chain,
        } => {
            let chain_id = chain_id_from_name(&chain)?;
            let stale = store
                .list_stale_verifications(chain_id, max_age_hours)
                .await?;

            println!(
                "[indexer] reverify chain={chain} stale_count={} max_age_hours={max_age_hours}",
                stale.len()
            );

            for (i, address) in stale.iter().enumerate() {
                match check_contract_verified(&client, &cfg, chain_id, address).await {
                    Ok(verified) => {
                        store
                            .update_verification(chain_id, address, verified)
                            .await?;
                        println!(
                            "[indexer] reverify {}/{} {address} verified={verified}",
                            i + 1,
                            stale.len()
                        );
                    }
                    Err(err) => {
                        eprintln!("[indexer] reverify failed {address}: {err}");
                    }
                }

                if (i + 1) % 5 == 0 && i + 1 < stale.len() {
                    tokio::time::sleep(Duration::from_millis(250)).await;
                }
            }

            println!("[indexer] reverify complete");
        }
    }

    Ok(())
}
