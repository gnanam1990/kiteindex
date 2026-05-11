#!/usr/bin/env bash
# KiteIndex three-tier gateway demo
set -u

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

QUERY='{"query":"{ transferEvents(limit: 1) { items { from to value blockNumber } } }"}'
HDR_FILTER='HTTP/|x-kite-|^{'

step() {
  echo ""
  printf "${BOLD}${CYAN}# %s${RESET}\n" "$1"
  printf "${DIM}%s${RESET}\n" "$2"
  sleep 2.0
}

run() {
  printf "${YELLOW}\$ %s${RESET}\n" "$1"
  sleep 1.0
  eval "$1" 2>&1 | grep -iE "$HDR_FILTER" | head -20
  sleep 3.0
}

clear
printf "${BOLD}${GREEN}KiteIndex — three-tier GraphQL gateway${RESET}\n"
printf "${DIM}Hosted indexer for Kite Mainnet. Pay-per-query via Kite Passport.${RESET}\n"
sleep 3

step "1. Public tier" "No auth. IP rate-limited (10/min)."
run "curl -s -i http://localhost:42069/graphql/public -H 'Content-Type: application/json' -d '$QUERY'"

step "2. Free tier without session" "Returns 401 — kpass session required."
run "curl -s -i http://localhost:42069/graphql/free -H 'Content-Type: application/json' -d '$QUERY'"

step "3. Free tier with session" "100/min per session, no charge."
run "curl -s -i http://localhost:42069/graphql/free -H 'X-Kite-Session: dev_alice' -H 'Content-Type: application/json' -d '$QUERY'"

step "4. Paid tier" "1000/min. \$0.0001 per query. Cost headers on every response."
run "curl -s -i http://localhost:42069/graphql/paid -H 'X-Kite-Session: dev_bob' -H 'Content-Type: application/json' -d '$QUERY'"

echo ""
printf "${BOLD}${GREEN}Pay-per-query SaaS, native to Kite Agent Passport.${RESET}\n"
printf "${DIM}github.com/gnanam1990/kiteindex${RESET}\n"
sleep 3
