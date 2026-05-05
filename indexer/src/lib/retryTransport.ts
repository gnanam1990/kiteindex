import type { Transport } from "viem";

// Public Kite RPC endpoints (rpc.gokite.ai and the regional variants) are
// load-balanced across multiple backends, only some of which support
// `eth_getLogs`. Misses surface as JSON-RPC -32601 / MethodNotFoundRpcError,
// which Ponder treats as a non-retryable user error and crashes the indexer.
//
// This wrapper makes -32601 effectively transient by retrying indefinitely
// inside the transport before viem can mark it terminal. Other errors pass
// through unchanged. Combined with viem's `fallback` over all four regional
// endpoints, this masks the load-balancer flakiness until Kite ships
// indexer-grade RPC.
//
// Verified Day 1 (2026-05-03): per-endpoint eth_getLogs success rates were
// Virginia 6/10, Ireland 6/10, Tokyo 4/10, Global 2/10. A bounded retry
// chain (5 per endpoint × 4 endpoints) was exhausted during Day 2 backfill
// load. Bumped to 50 attempts × 4 endpoints. At the empirical 60% success
// rate, this gives ~99.99% per-request success. Watch for retry storms in
// production — sustained periods of >30 retries per logical query mean
// Kite's load-balancer health has degraded.
export function withMethodNotFoundRetry(
  transport: Transport,
  options: { maxAttempts?: number; initialDelayMs?: number; maxDelayMs?: number } = {},
): Transport {
  const { maxAttempts = 50, initialDelayMs = 50, maxDelayMs = 500 } = options;

  return ((config) => {
    const inner = transport(config);
    return {
      ...inner,
      async request(args: { method: string; params?: unknown }) {
        let attempt = 0;
        while (true) {
          try {
            return await inner.request(args);
          } catch (err) {
            if (!isMethodNotFound(err)) throw err;
            if (maxAttempts > 0 && attempt >= maxAttempts - 1) throw err;
            const wait = Math.min(initialDelayMs * 2 ** attempt, maxDelayMs);
            await new Promise((r) => setTimeout(r, wait));
            attempt += 1;
          }
        }
      },
    };
  }) as Transport;
}

function isMethodNotFound(err: unknown): boolean {
  const e = err as {
    code?: number;
    name?: string;
    message?: string;
    cause?: { code?: number };
  };
  if (e?.code === -32601) return true;
  if (e?.cause?.code === -32601) return true;
  if (e?.name === "MethodNotFoundRpcError") return true;
  const msg = String(e?.message ?? "");
  return /does not exist\s*\/\s*is not available|method.*not available/i.test(msg);
}
