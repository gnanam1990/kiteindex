# KiteIndex — Hard-Earned Context

This file captures non-obvious facts and design decisions. Do NOT change these without verifying the original investigation.

## What this is

KiteIndex is a hosted GraphQL indexer for Kite Mainnet (Avalanche L1, launched April 30, 2026). It indexes on-chain events from selected contracts into Postgres and exposes them via GraphQL. Free tier is public; paid tier authenticates via Kite Agent Passport (kpass CLI).

## Architectural decisions (do not undo)

### 1. Stack: TypeScript + Ponder, NOT Python + custom indexer
Ponder (https://ponder.sh) handles RPC connection management, reorg protection, schema migrations, and auto-generated GraphQL — all the parts that take months to write correctly from scratch. The Hono gateway in front of Ponder is what we write — it does kpass auth, rate limiting, and tier routing.

### 2. Auth via kpass subprocess, NOT REST API
Kite Passport REST API is not publicly documented. We shell out to `kpass user sessions --session-id $ID --output json` and parse JSON. Authoritative, supported, always in sync with whatever Kite ships. DO NOT replace with a guessed REST client.

### 3. Hosted, not decentralized
We are the indexer. v0.1 is one VPS running everything. A 4-day-old chain doesn't need a decentralized indexer; it needs ANY indexer.

### 4. Index a focused set of contracts, not all of them
v0.1 indexes 3 contracts. v0.2 adds 3 more. v0.3+ is community-driven.

### 5. SaaS pricing via kpass, not Stripe
All paid tiers go through Kite Agent Passport's pay-per-query model. KiteIndex is itself a demo of Kite-native monetization.

## Verified facts

### Kite Mainnet
- Chain ID: 2366 (`0x93e`)
- Public RPC endpoints (load-balanced; not all backends support eth_getLogs):
  - https://rpc-virginia.gokite.ai (Day 1 measured: 6/10 success)
  - https://rpc-ireland.gokite.ai (6/10)
  - https://rpc-tokyo.gokite.ai (4/10)
  - https://rpc.gokite.ai/ (2/10, global)
- Bridged USDC.e contract: 0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e (6 decimals)
- Mainnet launched: April 30, 2026
- Bridge UI: https://bridge.gokite.ai/

## RPC tuning (current)
- ethGetLogsBlockRange: 5000
- maxRequestsPerSecond: 25
- retryTransport: maxAttempts=50, initialDelayMs=50, maxDelayMs=500
- per-request success rate at 50 attempts: ~99.99% empirically

## Operational commitments
This service is committed to running 24/7. That means:
- Monitoring (BetterStack free tier, Telegram alerts on /healthz failure)
- /healthz endpoint exposing indexer head vs chain head, lag in seconds
- VPS with 4GB+ RAM (Hetzner CPX21)
- Postgres backups (daily snapshot)
- Domain auto-renew enabled

## Out of scope for v0.1 (resist scope creep)
- Decentralized indexer network
- Self-hosted Kite node (using public RPCs with retry layer)
- Historical backfill from genesis (USDC.e starts at Day 1 block, low-volume contracts go further back)
- Web frontend / playground UI (Ponder ships GraphiQL; that's enough for v0.1)
- web3.py — overkill, we use viem
- Postgres → another DB until multi-tenant load is real
- Production hosting at kiteindex.xyz. v0.1 ships as deploy-ready, not deployed. All deploy artifacts (Dockerfile, docker-compose.yml, Caddyfile, deploy/setup.sh, deploy/README.md) are committed and tested locally. Live hosting follows demand — design partners or sponsors trigger provisioning.

### Contracts indexed in v0.1

| Contract | Address | Why |
|---|---|---|
| Bridged USDC.e (`AssetController`-wrapped) | `0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e` | All x402 settlements + bridge mints/burns. High volume (~hundreds/day). |
| Lucid AssetController | `0x92E2391d0836e10b9e5EAB5d56BfC286Fadec25b` | Kite ↔ Avalanche cross-chain transfers. Low volume (~10/day) but each is meaningful. |
| KiteStakingManager (Proxy) | `0x7d627b0F5Ec62155db013B8E7d1Ca9bA53218E82` | Validator registration + delegator staking. Low volume (~16 events total at Day 4) but high-value: shows network security. Implementation at `0x57c5bf4fAC5AFb98C92ea4151999346CAd7494Db`. |

USDC.e is 6 decimals. KITE is 18 decimals. Stake amounts are in KITE (18 decimals).

### Verified event signatures

All topic hashes below are confirmed against real on-chain transactions (kitescan.ai, May 3 2026).

**USDC.e (standard ERC20):**
- `Transfer(address,address,uint256)` → `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`

**Lucid AssetController (cross-chain transfer lifecycle):**
- `TransferCreated(bytes32,uint256,uint256,address,address,uint256,bool)` → `0x7214d2a3fc41a2bc94a7a69749a3d127afd8d8e79e0573dbe7892d84ee6fdd74` — outbound, the meaty event with sender/recipient/amount
- `TransferRelayed(bytes32,address)` → `0x5a94fe36b9c96bbd30dafe9eb364e4d1ac0751c6f8c114bd0977952694149c07` — outbound, handed to bridge adapter
- `TransferReceived(bytes32,uint256,address)` → `0xb56eee7198c2db26c3593517941abaa02608050011d356b4f29e8a5c6a269aed` — inbound, bridge delivered
- `TransferExecuted(bytes32)` → `0xe843a2101c5af088cd2648db06f117411c38047d50a9f499f99cd99adb41490a` — inbound, funds released
- All 4 share `transferId` as the indexed key — correlate them by that.
- Avalanche C-Chain ID is `43114` (`0xa86a`). Bridge adapter on Kite: `0x5eF37628d45C80740fb6dB7eD9c0a753b4f85263`.

**KiteStakingManager (Avalanche L1 validator staking, not generic ERC20 staking):**
- `InitiatedStakingValidatorRegistration(bytes32,address,uint16,uint64,address,uint256)` → `0x986efedc26162a530fb8c54de635b2c97bafac85c687780e58819c8e9b878ac7` — validator joins
- `InitiatedDelegatorRegistration(bytes32,bytes32,address,uint64,uint64,uint64,bytes32,address,uint256)` → `0xbad1f930fbda86833c33ec498c283b2571541babb9ffd5313993037a1f51c6d9` — delegator stakes to a validator
- Validators stake `1,000,000 KITE` minimum (`1000000000000000000000000` raw). Delegators stake variable amounts (~3-10 KITE in early data).
- Default: `delegationFeeBips=100` (1%), `minStakeDuration=1,209,600s` (14 days).
- Other events likely exist in the contract source (`CompletedDelegatorRegistration`, `RewardClaimed`, etc.) but haven't fired yet at Day 4 because every delegator is still inside their 14-day minimum-stake period. Add handlers as we observe them.
