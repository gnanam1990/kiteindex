import type { Transport } from "viem";

// Public Kite RPC endpoints (rpc.gokite.ai and the regional variants) are
// load-balanced across multiple backends, only some of which support
// `eth_getLogs`. Misses surface as JSON-RPC -32601 / MethodNotFoundRpcError,
// which viem treats as non-retryable. This wrapper retries that specific
// failure mode in-process so a single unlucky backend doesn't kill the
// indexer mid-backfill.
//
// Verified Day 1 (2026-05-03): per-endpoint success rates were Virginia 6/10,
// Ireland 6/10, Tokyo 4/10, Global 2/10. Combined with viem's `fallback`,
// per-endpoint retries should mask the load-balancer flakiness until Kite
// ships indexer-grade RPC.
export function withMethodNotFoundRetry(
  transport: Transport,
  options: { attempts?: number; delayMs?: number } = {},
): Transport {
  const { attempts = 5, delayMs = 100 } = options;

  return ((config) => {
    const inner = transport(config);
    return {
      ...inner,
      async request(args: { method: string; params?: unknown }) {
        let lastError: unknown;
        for (let attempt = 0; attempt < attempts; attempt++) {
          try {
            return await inner.request(args);
          } catch (err) {
            if (!isMethodNotFound(err) || attempt === attempts - 1) {
              throw err;
            }
            lastError = err;
            const wait = delayMs * 2 ** attempt;
            await new Promise((r) => setTimeout(r, wait));
          }
        }
        throw lastError;
      },
    };
  }) as Transport;
}

function isMethodNotFound(err: unknown): boolean {
  const e = err as { code?: number; name?: string; message?: string; cause?: { code?: number } };
  if (e?.code === -32601) return true;
  if (e?.cause?.code === -32601) return true;
  if (e?.name === "MethodNotFoundRpcError") return true;
  const msg = String(e?.message ?? "");
  return /does not exist\s*\/\s*is not available|method.*not available/i.test(msg);
}
