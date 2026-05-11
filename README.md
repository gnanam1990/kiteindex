# KiteIndex

**The open-source indexer for Kite Mainnet.**

KiteIndex provides a fast, reliable GraphQL API for querying on-chain activity on Kite — USDC.e transfers, Lucid bridge events, staking, and more. Free public tier; paid tier authenticated via Kite Agent Passport.

**Status**: v0.1 complete and deploy-ready. Open-source from commit zero. Self-hostable in 30 minutes. Live hosting follows demand — see [deploy/README.md](deploy/README.md) or DM for a managed instance.

## Why this exists

Kite Mainnet launched April 30, 2026. As of day 4, no public indexer or subgraph exists. Every agent service that needs historical chain data has to either run its own indexer or query RPCs directly. KiteIndex fills that gap.

## What you get

- GraphQL API for Kite Mainnet on-chain data
- USDC.e transfers, bridge events, staking events (v0.1)
- Free public tier — no auth, rate-limited
- Paid tier — kpass session auth, higher rate limits, pay-per-query
- `/healthz` JSON endpoint — chain lag, row counts, kpass binary status, last error
- Open source. Self-hostable. Subgraph-compatible schema where possible.

## Architecture

```mermaid
flowchart LR
    Client(["Client / Agent"])
    Caddy["Caddy<br/>:80 → :443<br/>auto HTTPS"]
    Hono["Hono gateway<br/>:42069"]
    Public["/graphql/public<br/>10 req/min per IP"]
    Free["/graphql/free<br/>kpass auth · 100 rpm"]
    Paid["/graphql/paid<br/>kpass auth · 1000 rpm<br/>$0.0001 / query"]
    Healthz["/healthz<br/>5s cache · public"]
    Ponder["Ponder GraphQL<br/>indexer + schema"]
    Postgres[("Postgres<br/>onchain data")]
    Kpass[["kpass CLI<br/>session validate"]]
    Rpc{{"Kite RPC<br/>fallback over 4 regions<br/>+ -32601 retry transport"}}

    Client --> Caddy --> Hono
    Hono --> Public
    Hono --> Free
    Hono --> Paid
    Hono --> Healthz
    Free -. validates .-> Kpass
    Paid -. validates + charges .-> Kpass
    Public --> Ponder
    Free --> Ponder
    Paid --> Ponder
    Healthz --> Postgres
    Healthz --> Rpc
    Ponder --> Postgres
    Ponder -. eth_getLogs .-> Rpc
```

The four Kite RPC endpoints are tried in measured success-rate order (Virginia → Ireland → Tokyo → Global). `eth_getLogs` lands on backends that don't support it ~40% of the time; the retry transport masks `-32601` with up to 50 attempts per endpoint.

## Demo

27-second walkthrough of the three tiers — public (no auth), free (kpass session, no charge), and paid ($0.0001/query with `x-kite-cost-usd` / `x-kite-remaining-usd` headers).

[![asciicast](https://asciinema.org/a/4fq4tv9Y8uTMcS43.svg)](https://asciinema.org/a/4fq4tv9Y8uTMcS43)

## Try it now

Local demo, ~60 seconds:

```bash
git clone https://github.com/gnanam1990/kiteindex
cd kiteindex/indexer
npm install
KITEINDEX_FAKE_KPASS=1 PONDER_USDCE_START_BLOCK=78000 PONDER_LUCID_START_BLOCK=78000 PONDER_STAKING_START_BLOCK=78000 npx ponder dev
```

(The `PONDER_*_START_BLOCK` overrides keep the backfill fast for local iteration. Production indexes from genesis for low-volume contracts.)

Then in another terminal:

```bash
# Public tier - no auth needed
curl -s http://localhost:42069/graphql/public -H 'Content-Type: application/json' -d '{"query":"{ transferEvents(limit: 5) { items { from to value blockNumber } } }"}'

# Free tier - kpass session required (dev shim accepts any dev_ prefix)
curl -s http://localhost:42069/graphql/free -H 'X-Kite-Session: dev_alice' -H 'Content-Type: application/json' -d '{"query":"{ bridgeTransfers(limit: 5) { items { transferId direction status amount } } }"}'

# Paid tier - debits $0.0001 per query from your kpass session
curl -s -i http://localhost:42069/graphql/paid -H 'X-Kite-Session: dev_bob' -H 'Content-Type: application/json' -d '{"query":"{ validatorRegistrations(limit: 5) { items { owner stakeAmount delegationFeeBips } } }"}' | grep -E '^(HTTP|x-kite-)'
```

Watch the cost-transparency headers in the paid response:

```
x-kite-tier: paid
x-kite-cost-usd: 0.0001
x-kite-remaining-usd: 0.999900
```

The three queries above demonstrate the indexer's range: USDC.e transfers (public tier), Lucid cross-chain bridge state (free tier), and Avalanche-L1 validator analytics (paid tier).

For self-hosting on your own VPS (~30 minutes, ~$6/month): see [deploy/README.md](deploy/README.md).

## Deploy

See [deploy/README.md](./deploy/README.md) for the single-VPS Docker Compose setup (Caddy + Ponder + Postgres on Hetzner CPX21).

## Roadmap

See [ROADMAP.md](./ROADMAP.md). Targeting public v0.1 within 8 days of project start.

## Context

See [CONTEXT.md](./CONTEXT.md) for verified facts and design decisions that should not be undone.

## Contributing

Issues and PRs welcome at [github.com/gnanam1990/kiteindex](https://github.com/gnanam1990/kiteindex).

## Built by

[@gnanam1990](https://github.com/gnanam1990) — also maintainer of [PolyAgent](https://github.com/gnanam1990/polyagent), the first Polymarket signal service on Kite.

## License

MIT.
