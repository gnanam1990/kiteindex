# KiteIndex Roadmap

8-day build plan, then ongoing maintenance. Days are calendar days, not work-days; some are 4 hours, some are 1 hour.

## Day 0 — Foundations (today)

- [x] Choose stack (TypeScript + Ponder)
- [x] Buy domain (kiteindex.xyz at Porkbun)
- [x] Create GitHub repo
- [x] Write CONTEXT.md
- [x] Write this ROADMAP.md
- [ ] Push to GitHub, public

## Day 1 — Skeleton

- [ ] `npm create ponder@latest` — bootstrap project
- [ ] Configure Kite Mainnet RPC in ponder.config.ts (chain ID 2366)
- [ ] Define USDC.e Transfer event handler
- [ ] Run locally — watch it index a few blocks
- [ ] Commit first working indexer

## Day 2 — Add the other two contracts

- [ ] Lucid USDC Controller events (bridge in/out)
- [ ] KiteStakingManager events (Stake, Unstake, RewardClaimed)
- [ ] Schema entities for derived data (daily volume aggregates, top stakers)
- [ ] Local GraphQL query tests

## Day 3 — Hono gateway

- [ ] Hono server in front of Ponder's GraphQL
- [ ] kpass auth wrapper (subprocess pattern from PolyAgent)
- [ ] Rate limiting (in-memory for v0.1)
- [ ] Three tiers wired up: /graphql/public, /graphql/free, /graphql/paid

## Day 4 — Production deploy

- [ ] Provision Hetzner CPX21 VPS (Mumbai/Frankfurt — closest low latency for IN)
- [ ] Docker Compose: Ponder + Postgres + Hono + Caddy
- [ ] Caddy auto-HTTPS for kiteindex.xyz
- [ ] Point DNS at VPS (A record at Porkbun)
- [ ] Smoke-test public GraphQL endpoint over HTTPS

## Day 5 — Monitoring

- [ ] /healthz endpoint (indexer lag, DB health, last error)
- [ ] BetterStack uptime monitor (free tier)
- [ ] Telegram alert on /healthz failure for >2 minutes
- [ ] Postgres daily backup to local + off-site (Hetzner Storage Box, ~€3/mo)

## Day 6 — Polish

- [ ] README with screenshots, sample queries
- [ ] Mermaid architecture diagram in README
- [ ] Deploy GraphiQL playground at root
- [ ] Three killer queries documented (live transfers, daily volume, top stakers)

## Day 7 — Public launch prep

- [ ] Test the three tiers end-to-end with a real kpass session
- [ ] Record demo gif (peek)
- [ ] Final security audit (no creds in git, 2FA on all accounts, SSH key-only on VPS, firewall configured)

## Day 8 — Public launch

- [ ] Twitter long-form post (linking PolyAgent + KiteIndex)
- [ ] Kite Builders' Project forum post
- [ ] Add to Kite ecosystem awesome-list (if exists)
- [ ] Submit to GitHub topics: kite-ai, kite-passport, indexer, graphql, ponder

## Post-launch (ongoing)

- v0.2: Algebra DEX swaps, LayerZero bridge events, more tokens
- v0.3: Community-requested contracts (issue-driven)
- Webhook subscriptions (push instead of poll)
- Subgraph-compatibility layer (drop-in replacement for The Graph users)
- Migrate to Cloudflare Workers + neon Postgres if scale demands it

## Hard rules

- No production deploys at >11pm. Tired-deploy bugs cost more than a day's delay.
- No credentials in git. Ever. Use `.env`, document required vars in `.env.example`.
- Every production change goes through a PR, even if you're the only reviewer. Forces a 60-second sanity check.
- Renew domain auto-renewal on. Renew VPS via account credit, not card-on-file. Backups quarterly-tested by restoring to a scratch DB.
