import { createConfig } from "ponder";
import { fallback, http } from "viem";
import { erc20Abi } from "./abis/erc20Abi";
import { kiteStakingManagerAbi } from "./abis/kiteStakingManagerAbi";
import { lucidAssetControllerAbi } from "./abis/lucidAssetControllerAbi";
import { withMethodNotFoundRetry } from "./src/lib/retryTransport";

// USDC.e starts at the Day 1 block (forward-looking realtime indexing).
const USDCE_START_BLOCK = process.env.PONDER_USDCE_START_BLOCK
  ? Number(process.env.PONDER_USDCE_START_BLOCK)
  : 76600;

// Lucid bridge backfill from block 0 is theoretically possible but the
// flaky public RPC makes it expensive. 17904 is the first KiteStakingManager
// event and a reasonable lower bound for the active part of the chain.
// Override via PONDER_LUCID_START_BLOCK to go earlier.
const LUCID_START_BLOCK = process.env.PONDER_LUCID_START_BLOCK
  ? Number(process.env.PONDER_LUCID_START_BLOCK)
  : 17904;

// First KiteStakingManager event was at block 17904 (per CONTEXT.md).
const STAKING_START_BLOCK = process.env.PONDER_STAKING_START_BLOCK
  ? Number(process.env.PONDER_STAKING_START_BLOCK)
  : 17904;

// Public Kite RPC endpoints, ranked by measured eth_getLogs success rate
// (Day 1, 2026-05-03): Virginia 6/10, Ireland 6/10, Tokyo 4/10, Global 2/10.
// Each endpoint is load-balanced across backends — some backends don't
// support eth_getLogs and return -32601. We wrap each endpoint with an
// in-process retry on -32601 (50 attempts, exponential 100ms backoff), and
// then fall back across endpoints in success-rate order.
const KITE_ENDPOINTS = [
  "https://rpc-virginia.gokite.ai",
  "https://rpc-ireland.gokite.ai",
  "https://rpc-tokyo.gokite.ai",
  "https://rpc.gokite.ai/",
];

const kiteRpc = fallback(
  KITE_ENDPOINTS.map((url) => withMethodNotFoundRetry(http(url, { timeout: 15_000 }))),
  { rank: false, retryCount: 1 },
);

export default createConfig({
  chains: {
    kite: {
      id: 2366,
      rpc: kiteRpc,
      // Per-backend availability (not range size) is the bottleneck — see
      // CONTEXT.md. With Day 2 backfill spanning the full chain history, a
      // larger window cuts the call count without changing reliability:
      // capable backends handle 5000-block ranges fine; uncapable ones fail
      // identically regardless of window size.
      ethGetLogsBlockRange: 5000,
      maxRequestsPerSecond: 25,
    },
  },
  contracts: {
    UsdcE: {
      chain: "kite",
      abi: erc20Abi,
      address: "0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e",
      startBlock: USDCE_START_BLOCK,
    },
    LucidAssetController: {
      chain: "kite",
      abi: lucidAssetControllerAbi,
      address: "0x92E2391d0836e10b9e5EAB5d56BfC286Fadec25b",
      startBlock: LUCID_START_BLOCK,
    },
    KiteStakingManager: {
      chain: "kite",
      abi: kiteStakingManagerAbi,
      address: "0x7d627b0F5Ec62155db013B8E7d1Ca9bA53218E82",
      startBlock: STAKING_START_BLOCK,
    },
  },
});
