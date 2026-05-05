import { db, publicClients } from "ponder:api";
import {
  bridgeTransfer,
  transferEvent,
  validatorRegistration,
} from "ponder:schema";
import { count } from "drizzle-orm";
import { bigint, pgTable, text, varchar } from "drizzle-orm/pg-core";
import type { Context } from "hono";
import * as fs from "node:fs";

// /healthz is the BetterStack-friendly readiness probe. Public, no auth, no
// rate limit, response cached for 5s so a tight monitor schedule doesn't
// hammer Postgres on every poll.
//
// HTTP code: 200 when status is "ok" or "degraded"; 503 only when the
// indexer is genuinely broken (Postgres unreachable). "indexer process
// unresponsive" is intentionally not detected from inside the same process —
// a hung event loop would also hang this handler, so the operator's outer
// timeout (Caddy / BetterStack) is the real signal there.

const CACHE_TTL_MS = 5_000;
const STALE_COUNTS_MS = 60_000;
const DEGRADED_LAG_S = 30;
const KPASS_BINARY_PATH = "/usr/local/bin/kpass";
const KPASS_CONFIG_DIR = "/home/ponder/.kpass";

// Shape of the Ponder-internal _ponder_checkpoint table. Columns are stable
// since Ponder 0.11; we're on 0.16. Kept in this file so /healthz doesn't
// reach into Ponder's internal export paths.
const ponderCheckpoint = pgTable("_ponder_checkpoint", {
  chainName: text("chain_name").primaryKey(),
  chainId: bigint("chain_id", { mode: "number" }).notNull(),
  safeCheckpoint: varchar("safe_checkpoint", { length: 75 }).notNull(),
  latestCheckpoint: varchar("latest_checkpoint", { length: 75 }).notNull(),
  finalizedCheckpoint: varchar("finalized_checkpoint", {
    length: 75,
  }).notNull(),
});

// Inline checkpoint decoder — pulls just blockNumber and blockTimestamp out
// of Ponder's 75-char encoded checkpoint string.
//   [0..10)   blockTimestamp (unix seconds)
//   [10..26)  chainId
//   [26..42)  blockNumber
//   ...       transactionIndex / eventType / eventIndex (unused)
function decodeCheckpoint(s: string): {
  blockNumber: number;
  blockTimestamp: number;
} {
  return {
    blockTimestamp: Number(s.slice(0, 10)),
    blockNumber: Number(s.slice(26, 42)),
  };
}

type Status = "ok" | "degraded" | "unhealthy";

type RowCounts = {
  transfer_event: number;
  bridge_transfer: number;
  validator_registration: number;
};

type HealthzBody = {
  status: Status;
  indexer: {
    head_block: number;
    chain_head_block: number;
    lag_blocks: number;
    lag_seconds: number;
    last_event_indexed_at: string | null;
  } | null;
  database: {
    connected: boolean;
    row_counts: RowCounts;
  };
  kpass: {
    binary_present: boolean;
    binary_path: string;
    config_dir_present: boolean;
  };
  last_error: { message: string; at: string } | null;
  uptime_seconds: number;
};

const startTimeMs = Date.now();

let cache: { body: HealthzBody; status: number; expiresAt: number } | null =
  null;

let lastError: { message: string; at: string } | null = null;

let lastCounts: RowCounts | null = null;
let lastCountsChangeMs = Date.now();

export function recordError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  lastError = { message, at: new Date().toISOString() };
}

function countsChangedAndUpdate(current: RowCounts): boolean {
  if (lastCounts === null) {
    lastCounts = { ...current };
    lastCountsChangeMs = Date.now();
    return true;
  }
  const changed = (Object.keys(current) as (keyof RowCounts)[]).some(
    (k) => current[k] !== lastCounts![k],
  );
  if (changed) {
    lastCounts = { ...current };
    lastCountsChangeMs = Date.now();
  }
  return changed;
}

async function readIndexerHead(): Promise<{
  head_block: number;
  last_event_indexed_at: string;
} | null> {
  const rows = await db.select().from(ponderCheckpoint).limit(1);
  if (rows.length === 0) return null;
  const decoded = decodeCheckpoint(rows[0]!.latestCheckpoint);
  if (decoded.blockNumber === 0 && decoded.blockTimestamp === 0) return null;
  return {
    head_block: decoded.blockNumber,
    last_event_indexed_at: new Date(
      decoded.blockTimestamp * 1000,
    ).toISOString(),
  };
}

async function readRowCounts(): Promise<RowCounts> {
  const [t, b, v] = await Promise.all([
    db.select({ value: count() }).from(transferEvent),
    db.select({ value: count() }).from(bridgeTransfer),
    db.select({ value: count() }).from(validatorRegistration),
  ]);
  return {
    transfer_event: Number(t[0]?.value ?? 0),
    bridge_transfer: Number(b[0]?.value ?? 0),
    validator_registration: Number(v[0]?.value ?? 0),
  };
}

async function readChainHead(): Promise<{
  number: number;
  timestamp: number;
}> {
  const block = await publicClients.kite.getBlock({ blockTag: "latest" });
  return { number: Number(block.number), timestamp: Number(block.timestamp) };
}

// Real timestamp of the indexer's head block, fetched by number from RPC.
// Why not use the checkpoint's encoded blockTimestamp? On chains with sparse
// activity Ponder's `latestCheckpoint` advances per processed event-bearing
// block, so its embedded timestamp can lag the actual block scan position by
// minutes-to-hours during quiet windows. Fetching the real block keeps
// lag_seconds and last_event_indexed_at honest.
async function readIndexerHeadBlockTimestamp(
  blockNumber: number,
): Promise<number> {
  const block = await publicClients.kite.getBlock({
    blockNumber: BigInt(blockNumber),
  });
  return Number(block.timestamp);
}

async function compute(): Promise<{ body: HealthzBody; status: number }> {
  let dbConnected = true;
  let rowCounts: RowCounts = {
    transfer_event: 0,
    bridge_transfer: 0,
    validator_registration: 0,
  };
  let indexerHead: Awaited<ReturnType<typeof readIndexerHead>> = null;

  try {
    [rowCounts, indexerHead] = await Promise.all([
      readRowCounts(),
      readIndexerHead(),
    ]);
  } catch (err) {
    dbConnected = false;
    recordError(err);
  }

  let chainHead: Awaited<ReturnType<typeof readChainHead>> | null = null;
  let indexerBlockTimestamp: number | null = null;
  if (indexerHead) {
    const [chainResult, indexerResult] = await Promise.allSettled([
      readChainHead(),
      readIndexerHeadBlockTimestamp(indexerHead.head_block),
    ]);
    if (chainResult.status === "fulfilled") {
      chainHead = chainResult.value;
    } else {
      recordError(chainResult.reason);
    }
    if (indexerResult.status === "fulfilled") {
      indexerBlockTimestamp = indexerResult.value;
    } else {
      recordError(indexerResult.reason);
    }
  } else {
    try {
      chainHead = await readChainHead();
    } catch (err) {
      recordError(err);
    }
  }

  const indexer =
    indexerHead && chainHead && indexerBlockTimestamp !== null
      ? {
          head_block: indexerHead.head_block,
          chain_head_block: chainHead.number,
          lag_blocks: Math.max(0, chainHead.number - indexerHead.head_block),
          lag_seconds: Math.max(
            0,
            chainHead.timestamp - indexerBlockTimestamp,
          ),
          last_event_indexed_at: new Date(
            indexerBlockTimestamp * 1000,
          ).toISOString(),
        }
      : null;

  // countsChangedAndUpdate must run on every compute so the timestamp tracks
  // real time; treat "no change in >60s" as stale only when the DB read
  // itself succeeded.
  const changed = countsChangedAndUpdate(rowCounts);
  const stale = dbConnected && !changed && Date.now() - lastCountsChangeMs > STALE_COUNTS_MS;

  let status: Status;
  let httpCode: number;
  if (!dbConnected) {
    status = "unhealthy";
    httpCode = 503;
  } else if (
    !indexer ||
    indexer.lag_seconds > DEGRADED_LAG_S ||
    stale
  ) {
    status = "degraded";
    httpCode = 200;
  } else {
    status = "ok";
    httpCode = 200;
  }

  const body: HealthzBody = {
    status,
    indexer,
    database: { connected: dbConnected, row_counts: rowCounts },
    kpass: {
      binary_present: fs.existsSync(KPASS_BINARY_PATH),
      binary_path: KPASS_BINARY_PATH,
      config_dir_present: fs.existsSync(KPASS_CONFIG_DIR),
    },
    last_error: lastError,
    uptime_seconds: Math.floor((Date.now() - startTimeMs) / 1000),
  };

  return { body, status: httpCode };
}

export async function healthzHandler(c: Context) {
  if (cache && cache.expiresAt > Date.now()) {
    return c.json(cache.body, cache.status as 200 | 503);
  }
  // compute() catches its own DB and RPC errors and folds them into the
  // documented schema. Anything that escapes here is unexpected — let Hono's
  // default 500 handler fire so monitors see a real failure rather than a
  // schema-drifted 503 body.
  const { body, status } = await compute();
  cache = { body, status, expiresAt: Date.now() + CACHE_TTL_MS };
  return c.json(body, status as 200 | 503);
}
