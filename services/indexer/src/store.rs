use anyhow::{Context, Result};
use chrono::Utc;
use futures::stream::TryStreamExt;
use mongodb::bson::{doc, Bson, DateTime as BsonDateTime, Document};
use mongodb::options::{IndexOptions, UpdateOptions};
use mongodb::{Client, Collection, IndexModel};

use crate::config::Config;
use crate::deployments::RawDeployment;

pub struct Store {
    db: mongodb::Database,
}

impl Store {
    pub async fn connect(cfg: &Config) -> Result<Self> {
        let client = Client::with_uri_str(&cfg.mongo_uri)
            .await
            .context("MongoDB connect")?;
        let db = client.database(&cfg.mongo_db);
        let store = Self { db };
        store.ensure_indexes().await?;
        Ok(store)
    }

    fn deployments(&self) -> Collection<Bson> {
        self.db.collection("contract_deployments")
    }

    fn verifications(&self) -> Collection<Bson> {
        self.db.collection("contract_verifications")
    }

    fn wallets(&self) -> Collection<Bson> {
        self.db.collection("wallet_deployments")
    }

    async fn ensure_indexes(&self) -> Result<()> {
        let deploy_idx = IndexModel::builder()
            .keys(doc! { "chain_id": 1, "contract_address": 1 })
            .options(
                IndexOptions::builder()
                    .unique(true)
                    .name(Some("uq_chain_contract".to_string()))
                    .build(),
            )
            .build();

        let deployer_idx = IndexModel::builder()
            .keys(doc! { "chain_id": 1, "deployer_address": 1 })
            .options(
                IndexOptions::builder()
                    .name(Some("idx_chain_deployer".to_string()))
                    .build(),
            )
            .build();

        let ver_idx = IndexModel::builder()
            .keys(doc! { "chain_id": 1, "contract_address": 1 })
            .options(
                IndexOptions::builder()
                    .unique(true)
                    .name(Some("uq_chain_contract_verification".to_string()))
                    .build(),
            )
            .build();

        let wallet_idx = IndexModel::builder()
            .keys(doc! { "chain_id": 1, "deployer_address": 1 })
            .options(
                IndexOptions::builder()
                    .unique(true)
                    .name(Some("uq_chain_wallet_deployments".to_string()))
                    .build(),
            )
            .build();

        self.deployments()
            .create_indexes(vec![deploy_idx, deployer_idx])
            .await?;
        self.verifications().create_indexes(vec![ver_idx]).await?;
        self.wallets().create_indexes(vec![wallet_idx]).await?;

        Ok(())
    }

    pub async fn save_backfill(
        &self,
        chain_id: u32,
        deployer: &str,
        rows: &[(RawDeployment, bool)],
    ) -> Result<()> {
        let now = BsonDateTime::from_millis(Utc::now().timestamp_millis());
        let chain = Bson::Int32(chain_id as i32);
        let opts = UpdateOptions::builder().upsert(true).build();

        for (row, verified) in rows {
            self.deployments()
                .update_one(
                    doc! { "chain_id": &chain, "contract_address": &row.contract_address },
                    doc! { "$set": {
                        "chain_id": &chain,
                        "contract_address": &row.contract_address,
                        "deployer_address": deployer,
                        "transaction_hash": &row.transaction_hash,
                        "block_number": row.block_number,
                        "timestamp": row.timestamp,
                        "indexed_at": now,
                    }},
                )
                .with_options(opts.clone())
                .await?;

            self.verifications()
                .update_one(
                    doc! { "chain_id": &chain, "contract_address": &row.contract_address },
                    doc! { "$set": {
                        "chain_id": &chain,
                        "contract_address": &row.contract_address,
                        "is_verified": *verified,
                        "checked_at": now,
                    }},
                )
                .with_options(opts.clone())
                .await?;
        }

        self.wallets()
            .update_one(
                doc! { "chain_id": &chain, "deployer_address": deployer },
                doc! { "$set": {
                    "chain_id": &chain,
                    "deployer_address": deployer,
                    "contract_count": rows.len() as i64,
                    "indexed_at": now,
                    "updated_at": now,
                }},
            )
            .with_options(opts)
            .await?;

        Ok(())
    }

    pub async fn mark_empty_wallet(&self, chain_id: u32, deployer: &str) -> Result<()> {
        let now = BsonDateTime::from_millis(Utc::now().timestamp_millis());
        let chain = Bson::Int32(chain_id as i32);

        self.wallets()
            .update_one(
                doc! { "chain_id": &chain, "deployer_address": deployer },
                doc! { "$set": {
                    "chain_id": &chain,
                    "deployer_address": deployer,
                    "contract_count": 0_i64,
                    "indexed_at": now,
                    "updated_at": now,
                }},
            )
            .with_options(UpdateOptions::builder().upsert(true).build())
            .await?;

        Ok(())
    }

    /// All indexed wallets, optionally filtered by chain.
    pub async fn list_wallets(&self, chain_id: Option<u32>) -> Result<Vec<(u32, String)>> {
        let mut filter = doc! {};
        if let Some(cid) = chain_id {
            filter.insert("chain_id", Bson::Int32(cid as i32));
        }

        let mut cursor = self
            .db
            .collection::<Document>("wallet_deployments")
            .find(filter)
            .await?;
        let mut out = Vec::new();

        while let Some(doc) = cursor.try_next().await? {
            let cid = doc
                .get_i32("chain_id")
                .or_else(|_| doc.get_i64("chain_id").map(|v| v as i32))
                .unwrap_or(1) as u32;
            let addr = doc
                .get_str("deployer_address")
                .unwrap_or("")
                .to_string();
            if !addr.is_empty() {
                out.push((cid, addr));
            }
        }

        Ok(out)
    }

    /// Contract addresses whose verification check is older than max_age_hours.
    pub async fn list_stale_verifications(
        &self,
        chain_id: u32,
        max_age_hours: u64,
    ) -> Result<Vec<String>> {
        let cutoff_ms =
            Utc::now().timestamp_millis() - (max_age_hours as i64 * 3600 * 1000);
        let cutoff = BsonDateTime::from_millis(cutoff_ms);
        let chain = Bson::Int32(chain_id as i32);

        let filter = doc! {
            "chain_id": &chain,
            "checked_at": { "$lt": cutoff },
        };

        let mut cursor = self
            .db
            .collection::<Document>("contract_verifications")
            .find(filter)
            .await?;
        let mut out = Vec::new();

        while let Some(doc) = cursor.try_next().await? {
            if let Ok(addr) = doc.get_str("contract_address") {
                out.push(addr.to_string());
            }
        }

        Ok(out)
    }

    pub async fn update_verification(
        &self,
        chain_id: u32,
        contract_address: &str,
        is_verified: bool,
    ) -> Result<()> {
        let now = BsonDateTime::from_millis(Utc::now().timestamp_millis());
        let chain = Bson::Int32(chain_id as i32);

        self.verifications()
            .update_one(
                doc! { "chain_id": &chain, "contract_address": contract_address },
                doc! { "$set": {
                    "chain_id": &chain,
                    "contract_address": contract_address,
                    "is_verified": is_verified,
                    "checked_at": now,
                }},
            )
            .with_options(UpdateOptions::builder().upsert(true).build())
            .await?;

        Ok(())
    }
}
