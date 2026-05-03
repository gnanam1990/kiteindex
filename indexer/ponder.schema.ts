import { index, onchainTable } from "ponder";

export const transferEvent = onchainTable(
  "transfer_event",
  (t) => ({
    id: t.text().primaryKey(),
    token: t.hex().notNull(),
    from: t.hex().notNull(),
    to: t.hex().notNull(),
    value: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    fromIdx: index().on(table.from),
    toIdx: index().on(table.to),
    blockIdx: index().on(table.blockNumber),
  }),
);

// One row per Lucid cross-chain transfer, keyed by transferId. All four
// lifecycle events update this same row:
//   outbound (Kite → other): TransferCreated → TransferRelayed
//   inbound  (other → Kite): TransferReceived → TransferExecuted
export const bridgeTransfer = onchainTable(
  "bridge_transfer",
  (t) => ({
    transferId: t.hex().primaryKey(),
    direction: t.text().notNull(), // "out" | "in"
    status: t.text().notNull(), // "created" | "relayed" | "received" | "executed"
    counterpartyChainId: t.bigint().notNull(),
    sender: t.hex(),
    recipient: t.hex(),
    amount: t.bigint(),
    unwrap: t.boolean(),
    bridgeAdapter: t.hex(),
    createdBlock: t.bigint(),
    createdAt: t.integer(),
    createdTxHash: t.hex(),
    relayedBlock: t.bigint(),
    relayedAt: t.integer(),
    receivedBlock: t.bigint(),
    receivedAt: t.integer(),
    executedBlock: t.bigint(),
    executedAt: t.integer(),
  }),
  (table) => ({
    directionIdx: index().on(table.direction),
    statusIdx: index().on(table.status),
    senderIdx: index().on(table.sender),
  }),
);

// One row per validator registration on Kite (Avalanche L1 staking).
export const validatorRegistration = onchainTable(
  "validator_registration",
  (t) => ({
    validationId: t.hex().primaryKey(),
    owner: t.hex().notNull(),
    rewardRecipient: t.hex().notNull(),
    delegationFeeBips: t.integer().notNull(),
    minStakeDuration: t.bigint().notNull(),
    stakeAmount: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    ownerIdx: index().on(table.owner),
  }),
);

// One row per delegator registration. validationId references
// validator_registration.validationId (FK by convention; not enforced in
// onchainTable).
export const delegatorRegistration = onchainTable(
  "delegator_registration",
  (t) => ({
    delegationId: t.hex().primaryKey(),
    validationId: t.hex().notNull(),
    delegator: t.hex().notNull(),
    rewardRecipient: t.hex().notNull(),
    nonce: t.bigint().notNull(),
    validatorWeight: t.bigint().notNull(),
    delegatorWeight: t.bigint().notNull(),
    stakeAmount: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    delegatorIdx: index().on(table.delegator),
    validationIdx: index().on(table.validationId),
  }),
);
