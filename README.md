# KiteIndex

**The open-source indexer for Kite Mainnet.**

KiteIndex provides a fast, reliable GraphQL API for querying on-chain activity on Kite — USDC.e transfers, Lucid bridge events, staking, and more. Free public tier; paid tier authenticated via Kite Agent Passport.

> Status: Day 0. Foundations laid, building begins tomorrow.
> Live URL: https://kiteindex.xyz (coming soon)

## Why this exists

Kite Mainnet launched April 30, 2026. As of day 4, no public indexer or subgraph exists. Every agent service that needs historical chain data has to either run its own indexer or query RPCs directly. KiteIndex fills that gap.

## What you get

- GraphQL API for Kite Mainnet on-chain data
- USDC.e transfers, bridge events, staking events (v0.1)
- Free public tier — no auth, rate-limited
- Paid tier — kpass session auth, higher rate limits, pay-per-query
- Open source. Self-hostable. Subgraph-compatible schema where possible.

## Roadmap

See [ROADMAP.md](./ROADMAP.md). Targeting public v0.1 within 8 days of project start.

## Architecture

See [CONTEXT.md](./CONTEXT.md) for verified facts and design decisions that should not be undone.

## Built by

[@gnanam1990](https://github.com/gnanam1990) — also maintainer of [PolyAgent](https://github.com/gnanam1990/polyagent), the first Polymarket signal service on Kite.

## License

MIT.
