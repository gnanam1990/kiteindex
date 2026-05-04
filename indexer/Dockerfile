# syntax=docker/dockerfile:1.6
#
# kiteindex indexer + gateway
# - Builder stage: full deps, type-check the project so a bad commit doesn't
#   reach production.
# - Runtime stage: production deps only, non-root user, healthcheck on /health.
#
# The `kpass` binary is NOT copied into the image. The host installs it once
# via deploy/setup.sh, and docker-compose mounts /usr/local/bin/kpass into
# the container read-only. This keeps the image small and lets kpass updates
# happen on the host without rebuilds.

# ---------- Builder ---------------------------------------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY ponder.config.ts ponder.schema.ts tsconfig.json ./
COPY abis ./abis
COPY src ./src

# Generate ponder-env.d.ts so tsc can resolve `ponder:registry`,
# `ponder:schema`, and `ponder:api` virtual modules.
RUN npx ponder codegen
RUN npx tsc --noEmit

# ---------- Runtime ---------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

# curl for the healthcheck, ca-certificates for outbound TLS, tini for
# proper signal handling so SIGTERM reaches the node process cleanly.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    curl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --uid 1001 --create-home --shell /bin/bash ponder

WORKDIR /app

# Production deps only. devDependencies (typescript, @types/node) are
# build-time only.
COPY --chown=ponder:ponder package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=ponder:ponder /app/ponder.config.ts ./
COPY --from=builder --chown=ponder:ponder /app/ponder.schema.ts ./
COPY --from=builder --chown=ponder:ponder /app/tsconfig.json ./
COPY --from=builder --chown=ponder:ponder /app/ponder-env.d.ts ./
COPY --from=builder --chown=ponder:ponder /app/abis ./abis
COPY --from=builder --chown=ponder:ponder /app/src ./src

USER ponder

ENV NODE_ENV=production \
    PORT=42069

EXPOSE 42069

# Ponder's /health returns 200 as soon as the HTTP server is up, which
# happens before backfill completes — so the healthcheck flips green
# quickly and stays green during the backfill window.
HEALTHCHECK --interval=15s --timeout=3s --start-period=60s --retries=3 \
  CMD curl -fsS http://localhost:42069/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npx", "ponder", "start"]
