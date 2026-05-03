// KiteStakingManager events that have actually fired on chain at Day 4.
// Other lifecycle events exist in the implementation source but won't appear
// until delegators clear the 14-day minimum stake. Add them as we observe
// them. Topic hashes verified against on-chain data; see CONTEXT.md.
export const kiteStakingManagerAbi = [
  {
    type: "event",
    name: "InitiatedStakingValidatorRegistration",
    anonymous: false,
    inputs: [
      { name: "validationID", type: "bytes32", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "delegationFeeBips", type: "uint16", indexed: false },
      { name: "minStakeDuration", type: "uint64", indexed: false },
      { name: "rewardRecipient", type: "address", indexed: false },
      { name: "stakeAmount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "InitiatedDelegatorRegistration",
    anonymous: false,
    inputs: [
      { name: "delegationID", type: "bytes32", indexed: true },
      { name: "validationID", type: "bytes32", indexed: true },
      { name: "delegatorAddress", type: "address", indexed: true },
      { name: "nonce", type: "uint64", indexed: false },
      { name: "validatorWeight", type: "uint64", indexed: false },
      { name: "delegatorWeight", type: "uint64", indexed: false },
      { name: "setWeightMessageID", type: "bytes32", indexed: false },
      { name: "rewardRecipient", type: "address", indexed: false },
      { name: "stakeAmount", type: "uint256", indexed: false },
    ],
  },
] as const;
