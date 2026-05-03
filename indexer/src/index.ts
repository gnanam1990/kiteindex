import { ponder } from "ponder:registry";
import {
  bridgeTransfer,
  delegatorRegistration,
  transferEvent,
  validatorRegistration,
} from "ponder:schema";

// USDC.e ERC-20 transfers (Day 1).
ponder.on("UsdcE:Transfer", async ({ event, context }) => {
  const { from, to, value } = event.args;
  const txHash = event.transaction.hash;

  await context.db.insert(transferEvent).values({
    id: `${txHash}-${event.log.logIndex}`,
    token: context.contracts.UsdcE.address as `0x${string}`,
    from,
    to,
    value,
    blockNumber: event.block.number,
    timestamp: Number(event.block.timestamp),
    txHash,
  });

  console.log(
    `[USDC.e] block ${event.block.number} ${from} -> ${to} ${value.toString()} (tx ${txHash})`,
  );
});

// ---- Lucid AssetController (cross-chain transfer lifecycle) ----
//
// Outbound (Kite → other chain): TransferCreated → TransferRelayed
// Inbound  (other chain → Kite): TransferReceived → TransferExecuted
//
// All four events share `transferId`; we keep one row per transferId and
// upgrade `status` as later events arrive.

ponder.on("LucidAssetController:TransferCreated", async ({ event, context }) => {
  const { transferId, destChainId, sender, recipient, amount, unwrap } = event.args;
  const ts = Number(event.block.timestamp);

  await context.db
    .insert(bridgeTransfer)
    .values({
      transferId,
      direction: "out",
      status: "created",
      counterpartyChainId: destChainId,
      sender,
      recipient,
      amount,
      unwrap,
      createdBlock: event.block.number,
      createdAt: ts,
      createdTxHash: event.transaction.hash,
    })
    .onConflictDoUpdate(() => ({
      direction: "out",
      status: "created",
      counterpartyChainId: destChainId,
      sender,
      recipient,
      amount,
      unwrap,
      createdBlock: event.block.number,
      createdAt: ts,
      createdTxHash: event.transaction.hash,
    }));

  console.log(
    `[Lucid] OUT created transferId=${transferId} dest=${destChainId} amount=${amount} sender=${sender}`,
  );
});

ponder.on("LucidAssetController:TransferRelayed", async ({ event, context }) => {
  const { transferId, bridgeAdapter } = event.args;
  const ts = Number(event.block.timestamp);

  await context.db
    .insert(bridgeTransfer)
    .values({
      transferId,
      direction: "out",
      status: "relayed",
      counterpartyChainId: 0n,
      bridgeAdapter,
      relayedBlock: event.block.number,
      relayedAt: ts,
    })
    .onConflictDoUpdate(() => ({
      status: "relayed",
      bridgeAdapter,
      relayedBlock: event.block.number,
      relayedAt: ts,
    }));

  console.log(`[Lucid] OUT relayed transferId=${transferId} adapter=${bridgeAdapter}`);
});

ponder.on("LucidAssetController:TransferReceived", async ({ event, context }) => {
  const { transferId, originChainId, bridgeAdapter } = event.args;
  const ts = Number(event.block.timestamp);

  await context.db
    .insert(bridgeTransfer)
    .values({
      transferId,
      direction: "in",
      status: "received",
      counterpartyChainId: originChainId,
      bridgeAdapter,
      receivedBlock: event.block.number,
      receivedAt: ts,
    })
    .onConflictDoUpdate(() => ({
      direction: "in",
      status: "received",
      counterpartyChainId: originChainId,
      bridgeAdapter,
      receivedBlock: event.block.number,
      receivedAt: ts,
    }));

  console.log(
    `[Lucid] IN received transferId=${transferId} origin=${originChainId} adapter=${bridgeAdapter}`,
  );
});

ponder.on("LucidAssetController:TransferExecuted", async ({ event, context }) => {
  const { transferId } = event.args;
  const ts = Number(event.block.timestamp);

  await context.db
    .insert(bridgeTransfer)
    .values({
      transferId,
      direction: "in",
      status: "executed",
      counterpartyChainId: 0n,
      executedBlock: event.block.number,
      executedAt: ts,
    })
    .onConflictDoUpdate(() => ({
      status: "executed",
      executedBlock: event.block.number,
      executedAt: ts,
    }));

  console.log(`[Lucid] IN executed transferId=${transferId}`);
});

// ---- KiteStakingManager (Avalanche L1 validator + delegator staking) ----

ponder.on(
  "KiteStakingManager:InitiatedStakingValidatorRegistration",
  async ({ event, context }) => {
    const {
      validationID,
      owner,
      delegationFeeBips,
      minStakeDuration,
      rewardRecipient,
      stakeAmount,
    } = event.args;

    await context.db.insert(validatorRegistration).values({
      validationId: validationID,
      owner,
      rewardRecipient,
      delegationFeeBips: Number(delegationFeeBips),
      minStakeDuration,
      stakeAmount,
      blockNumber: event.block.number,
      timestamp: Number(event.block.timestamp),
      txHash: event.transaction.hash,
    });

    console.log(
      `[Staking] validator registered validationID=${validationID} owner=${owner} stake=${stakeAmount}`,
    );
  },
);

ponder.on(
  "KiteStakingManager:InitiatedDelegatorRegistration",
  async ({ event, context }) => {
    const {
      delegationID,
      validationID,
      delegatorAddress,
      nonce,
      validatorWeight,
      delegatorWeight,
      rewardRecipient,
      stakeAmount,
    } = event.args;

    await context.db.insert(delegatorRegistration).values({
      delegationId: delegationID,
      validationId: validationID,
      delegator: delegatorAddress,
      rewardRecipient,
      nonce,
      validatorWeight,
      delegatorWeight,
      stakeAmount,
      blockNumber: event.block.number,
      timestamp: Number(event.block.timestamp),
      txHash: event.transaction.hash,
    });

    console.log(
      `[Staking] delegator registered delegationID=${delegationID} delegator=${delegatorAddress} stake=${stakeAmount}`,
    );
  },
);
