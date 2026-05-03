// Per-session spend tracker for the paid tier. v0.1 keeps the running total
// in process memory and never actually moves USDC — every successful query
// against /graphql/paid mentally deducts COST_USD from the kpass-reported
// remaining_budget. State is lost on restart; v0.2 will reconcile via real
// kpass wallet send calls and a persistent ledger.
export const COST_USD = 0.0001;

const spent = new Map<string, number>();

export function tryCharge(
  sessionId: string,
  remainingBudget: number,
): { ok: boolean; remainingAfter: number; alreadySpent: number } {
  const alreadySpent = spent.get(sessionId) ?? 0;
  const wouldBeSpent = alreadySpent + COST_USD;
  const remainingAfter = remainingBudget - wouldBeSpent;
  if (remainingAfter < 0) {
    return { ok: false, remainingAfter: remainingBudget - alreadySpent, alreadySpent };
  }
  spent.set(sessionId, wouldBeSpent);
  return { ok: true, remainingAfter, alreadySpent: wouldBeSpent };
}

export function refund(sessionId: string): void {
  const current = spent.get(sessionId) ?? 0;
  spent.set(sessionId, Math.max(0, current - COST_USD));
}

export function getSpent(sessionId: string): number {
  return spent.get(sessionId) ?? 0;
}

export function _resetSpend(): void {
  spent.clear();
}
