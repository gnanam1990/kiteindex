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

## Day 4 — Deploy artifacts (DONE, awaits Day 8 to actually deploy)

- [x] Dockerfile, docker-compose.yml, Caddyfile committed
- [x] deploy/setup.sh + deploy/README.md ready
- Deploy itself deferred to Day 8 — no point burning VPS hours on something
  that's still iterating

## Day 5 — Monitoring & /healthz internals

- [ ] /healthz endpoint exposing: indexer head block vs chain head, lag in
      seconds, DB connection healthy, last error
- [ ] Loki/Promtail or simple file-based log aggregation (decide later)
- [ ] Telegram bot for alert notifications

## Day 6 — README polish

- [ ] Mermaid architecture diagram in README
- [ ] Three killer GraphQL queries with sample responses
- [ ] Architecture decisions called out

## Day 7 — Demo capture

- [ ] Install peek (apt install peek)
- [ ] Record 25-second demo: /graphql/public → /graphql/free auth gate →
      /graphql/paid with cost headers
- [ ] Trim and add to README

## Day 8 — Production deploy

- [ ] Provision Hetzner CPX21 (Frankfurt or Ashburn)
- [ ] Upload SSH key (already done locally, just upload to Hetzner)
- [ ] Run setup.sh
- [ ] Copy ~/.kpass to VPS
- [ ] docker compose up -d --build
- [ ] Point DNS at VPS, wait for HTTPS
- [ ] Smoke test all three tiers over public HTTPS
- [ ] Monitor for first 4 hours

## Day 9 — Public launch

- [ ] Twitter long-form post
- [ ] Kite Builders' Project forum post
- [ ] GitHub topics + pin repo
