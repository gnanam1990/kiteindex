// Lucid AssetController cross-chain transfer lifecycle events.
// All 4 events share `transferId` as the indexed correlation key.
// Topic hashes verified against on-chain data; see CONTEXT.md.
export const lucidAssetControllerAbi = [
  {
    type: "event",
    name: "TransferCreated",
    anonymous: false,
    inputs: [
      { name: "transferId", type: "bytes32", indexed: true },
      { name: "destChainId", type: "uint256", indexed: true },
      { name: "threshold", type: "uint256", indexed: false },
      { name: "sender", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "unwrap", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TransferRelayed",
    anonymous: false,
    inputs: [
      { name: "transferId", type: "bytes32", indexed: true },
      { name: "bridgeAdapter", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TransferReceived",
    anonymous: false,
    inputs: [
      { name: "transferId", type: "bytes32", indexed: true },
      { name: "originChainId", type: "uint256", indexed: false },
      { name: "bridgeAdapter", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TransferExecuted",
    anonymous: false,
    inputs: [{ name: "transferId", type: "bytes32", indexed: true }],
  },
] as const;
