# KiteIndex — Hard-Earned Context

This file captures non-obvious facts and design decisions. Do NOT change these without verifying the original investigation.

## What this is

KiteIndex is a hosted GraphQL indexer for Kite Mainnet (Avalanche L1, launched April 30, 2026). It indexes on-chain events from selected contracts into Postgres and exposes them via GraphQL. Free tier is public; paid tier authenticates via Kite Agent Passport (kpass CLI).

## Architectural decisions (do not undo)

### 1. Stack: TypeScript + Ponder, NOT Python + custom indexer

Ponder (https://ponder.sh) is the indexing engine. It handles RPC connection management, reorg protection, schema migrations, and auto-generated GraphQL — all the parts that take months to write correctly from scratch. Used in production by ENS (ensnode) and others.

We deliberately reject "let's just build it in Python like PolyAgent" because:
- Reorg handling alone is a 2-week project to get right
- GraphQL auto-generation from schema is non-trivial
- Ponder gets us 80% of v0.1 in a config file
- Switching languages later (if needed) is easier than switching from custom indexer to Ponder later

The Hono gateway in front of Ponder's GraphQL is what we write — it does kpass auth, rate limiting, and tier routing.

### 2. Auth via kpass subprocess, NOT REST API

Same decision as PolyAgent. Kite Passport REST API is not publicly documented. We shell out to `kpass user sessions --session-id $ID --output json` and parse JSON. Authoritative, supported, always in sync with whatever Kite ships.

### 3. Hosted, not decentralized

We are the indexer. No staking, no curators, no decentralized network of indexers. v0.1 is one VPS running everything. This is intentional: a 4-day-old chain doesn't need a decentralized indexer; it needs *any* indexer.

### 4. Index a focused set of contracts, not all of them

v0.1 indexes 3 contracts only (see below). v0.2 adds 3 more. v0.3 onwards is community-driven (issues / requests determine priority). Indexing every contract from day 1 is how indexers go bankrupt on RPC costs.

### 5. SaaS pricing via kpass, not Stripe

All paid tiers go through Kite Agent Passport's pay-per-query model. This is meta on purpose: KiteIndex is itself a demo of Kite-native monetization. Subscribers don't need credit cards; agents pay for themselves with their own kpass sessions.

## Verified facts

### Kite Mainnet

- Chain ID: 2366 (`0x93e`)
- RPC: `https://rpc.gokite.ai/` (TODO: verify multiple endpoints, add failover list)
- Block time: ~1s (sub-second finality, Avalanche L1)
- Mainnet launched: April 30, 2026
- Bridge UI: `https://bridge.gokite.ai/` (Kite × Lucid partnership)

### Contracts indexed in v0.1

| Contract | Address | Why this one |
|---|---|---|
| Bridged USDC.e | `0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e` | All x402 settlements happen here. Volume = the agent economy's heartbeat. |
| Lucid USDC Controller | `0x92E2391d0836e10b9e5EAB5d56BfC286Fadec25b` | Bridge in/out events. Shows where money enters/leaves Kite. |
| KiteStakingManager (Proxy) | `0x7d627b0F5Ec62155db013B8E7d1Ca9bA53218E82` | Validator/delegator stake events. Network health proxy. |

USDC.e is 6 decimals. KITE is 18 decimals.

### Other Kite contracts (v0.2+ candidates, not v0.1)

| Token | Address | Decimals |
|---|---|---|
| WKITE | `0xcc788DC0486CD2BaacFf287eea1902cc09FbA570` | 18 |
| USDT | `0x3Fdd283C4c43A60398bf93CA01a8a8BD773a755b` | 6 |
| WETH | `0x3D66d6c3201190952e8EA973F59c4428b32D5F9b` | 18 |

Algebra DEX (concentrated liquidity):
- AlgebraFactory: `0x10253594A832f967994b44f33411940533302ACb`
- SwapRouter: `0x03f8B4b140249Dc7B2503C928E7258CCe1d91F1A`
- NonfungiblePositionManager: `0xD637cbc214Bc3dD354aBb309f4fE717ffdD0B28C`

LayerZero Bridge:
- LayerZero Chain ID for Kite: 2366
- LayerZero Endpoint ID: 30406
- EndpointV2: `0x6F475642a6e85809B1c36Fa62763669b1b48DD5B`

Other Lucid bridge controllers (deployed on Kite):
- WETH Controller: `0x638d1c70c7b047b192eB88657B411F84fAc74681`
- USDT Controller: `0x80bA7204f060Fd321BFE8d4F3aB2E2bF4e6fCe49`

### Source of truth for contracts

`https://docs.gokite.ai/kite-chain/3-developing/smart-contracts-list` — official, kept up to date.

## Three pricing tiers (initial — tune after launch)

| Endpoint | Auth | Rate limit | Use case |
|---|---|---|---|
| `/graphql/public` | none | 10 req/min per IP | Demos, exploration, attracting devs |
| `/graphql/free` | kpass session, no spend | 100 req/min | Builders prototyping their own agents |
| `/graphql/paid` | kpass session, $0.0001/query | 1000 req/min | Production agents |

Pricing is a placeholder. Real numbers come after v0.1 launch and observing usage.

## Out of scope for v0.1 (resist scope creep)

- Decentralized indexer network
- Self-hosted node (using public RPC for now)
- Historical backfill from genesis (start indexing from project start; backfill later if needed)
- Token economics, fee distribution mechanics
- Web frontend / playground UI (Ponder ships GraphiQL; that's enough for v0.1)
- Subscription management UI (kpass sessions ARE the subscription)
- Custom domain emails (`hello@kiteindex.xyz` etc. — later)

## Open questions to resolve in v0.1 build

- Confirm Kite RPC has eth_getLogs limits (block range cap, log count cap)
- Identify backup RPC endpoints (probably need 2-3 for failover)
- Confirm Kite block explorer URL for tx links in responses
- Decide: index from current block (forward-only) or include some history at launch
- Test: does Ponder support Avalanche L1 chains out of the box, or do we need a custom config?

## Operational commitments

This service is committed to running 24/7. That means:
- Monitoring (BetterStack free tier, Telegram alerts on failure)
- /healthz endpoint exposing indexer head vs chain head, lag in seconds
- VPS with 4GB+ RAM (Hetzner CPX21 or equivalent)
- Postgres backups (daily snapshot to off-site storage)
- Domain auto-renew enabled

If at any point this becomes unsustainable, the right move is to open-source the deploy scripts, document the architecture, and let someone else fork. The repo is MIT-licensed precisely so this is possible.
