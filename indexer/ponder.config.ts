import { createConfig } from "ponder";
import { fallback, http } from "viem";
import { erc20Abi } from "./abis/erc20Abi";
import { withMethodNotFoundRetry } from "./src/lib/retryTransport";

// Kite Mainnet launched 2026-04-30. v0.1 is forward-looking — we start a few
// dozen blocks behind chain head to capture recent activity, not historical
// backfill. Override via PONDER_START_BLOCK if you want to go earlier.
const START_BLOCK = process.env.PONDER_START_BLOCK
  ? Number(process.env.PONDER_START_BLOCK)
  : 76600;

// Public Kite RPC endpoints, ranked by measured eth_getLogs success rate
// (Day 1, 2026-05-03): Virginia 6/10, Ireland 6/10, Tokyo 4/10, Global 2/10.
// Each endpoint is load-balanced across backends — some backends don't
// support eth_getLogs and return -32601. We wrap each endpoint with an
// in-process retry on -32601 (5 attempts, exponential 100ms backoff), and
// then fall back across endpoints in success-rate order.
const KITE_ENDPOINTS = [
  "https://rpc-virginia.gokite.ai",
  "https://rpc-ireland.gokite.ai",
  "https://rpc-tokyo.gokite.ai",
  "https://rpc.gokite.ai/",
];

const kiteRpc = fallback(
  KITE_ENDPOINTS.map((url) =>
    withMethodNotFoundRetry(http(url, { timeout: 15_000 }), {
      attempts: 5,
      delayMs: 100,
    }),
  ),
  { rank: false, retryCount: 1 },
);

export default createConfig({
  chains: {
    kite: {
      id: 2366,
      rpc: kiteRpc,
      // Per-backend availability (not range size) is the bottleneck — see
      // CONTEXT.md. Keep this small to limit damage from a single bad pick.
      ethGetLogsBlockRange: 50,
      maxRequestsPerSecond: 10,
    },
  },
  contracts: {
    UsdcE: {
      chain: "kite",
      abi: erc20Abi,
      address: "0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e",
      startBlock: START_BLOCK,
    },
  },
});
