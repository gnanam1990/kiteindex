import { ponder } from "ponder:registry";
import { transferEvent } from "ponder:schema";

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
