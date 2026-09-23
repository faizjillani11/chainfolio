# Chainfolio — On-Chain Builder Portfolio

Analyze an Ethereum wallet's on-chain developer activity, get an explainable reputation score, and optionally mint a soulbound NFT or publish an EAS attestation on Sepolia.

## Features

- Wallet connect (RainbowKit) · deployment + verification detection · opt-in ENS
- Deterministic scoring with time multipliers and burst detection
- Soulbound Chainfolio NFT + EAS attestation · downloadable plain-text report
- Demo mode without API keys · optional MongoDB cache

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). That starts the analysis API, worker, and Next.js app (`infra/scripts/dev.js`). Local development only.

Copy `.env.example` → `.env.local` for live chain data, mint, or attest. Without keys, the app uses sample contracts with real scoring. MongoDB is optional.

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_ALCHEMY_API_KEY` / `ALCHEMY_API_KEY` | Deployments + RPC |
| `ETHERSCAN_API_KEY` | Contract verification |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect (optional for extensions) |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Chainfolio NFT (Sepolia) |
| `NEXT_PUBLIC_EAS_SCHEMA_UID` / `ATTESTER_PRIVATE_KEY` | EAS attestation |
| `MONGO_URI` / `MONGO_DB` | Optional persistence |
| `WORKER_URL` | BFF → worker (default `http://localhost:8000`) |
| `MOCK_CHAIN_DATA` | `1` = demo, `0` = require real keys |

## Architecture

```
Browser → Next.js BFF (:3000) → Analysis API (:8000) → ZeroMQ (:5000) → worker
         → chain-data + scoring → poll /api/analyze/[jobId]
```

MongoDB (`:27017`) is optional for job persistence and the indexed deployment cache.

**Specs:** `packages/scoring-spec/scoring.json` · `packages/chain-data-spec/schema.json` · `openapi/analysis.yaml` · `data/schema/mongodb.json`

## Scoring

| Signal | Points |
|--------|--------|
| Contract deployment | +5 (cap 10) |
| Verified contract | +10 (cap 10) |
| ENS ownership | +2 |
| ENS metadata (avatar / url / github) | +3 each |

Time weight: >30 days → 1.2× · recent → 0.8×. Burst (3+ deploys in 7 days) → extra 0.8× on those contracts.

| Score | Tier |
|-------|------|
| 0 | No Activity |
| 1–9 | Early Activity |
| 10–29 | Active Builder |
| 30–59 | Established |
| 60–99 | Prolific |
| 100+ | Extensive |

## On-chain

- **NFT** — `contracts/Chainfolio.sol`, soulbound ERC-721 on Sepolia (one mint per wallet). Metadata at `/api/token/[id]`.
- **EAS** — delegated signing via `/api/attest`; user submits on-chain. Schema helper: `scripts/registerSchema.ts`.

API details: `openapi/analysis.yaml`.

## Project structure

```
chainfolio/
├── apps/web/           # Next.js UI + BFF
├── packages/           # scoring-spec, chain-data-spec
├── services/analysis/  # Worker API, queue, chain-data
├── services/indexer/   # Rust CLI → MongoDB
├── contracts/          # Chainfolio.sol
├── infra/              # Dev launcher
├── openapi/            # API contract
├── scripts/            # Deploy, compile, seed
└── tests/              # Scoring parity
```

## Tech stack

Next.js 16 · React 19 · TypeScript · Tailwind · RainbowKit/Wagmi · ethers v6 · Express + ZeroMQ + MongoDB · Rust indexer · Solidity 0.8.20 · EAS SDK

## Disclaimer

Scores reflect on-chain activity only — not developer skill or code quality. Data may be incomplete.
