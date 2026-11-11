export type OrderTotalInput = { status: string; amountCents: number };

export type PaidOrderTotals = {
  paidOrderCount: number;
  paidCents: number;
  refundedCents: number;
};

/** Aggregates the rows currently visible after the grid's filters are applied. */
export function aggregatePaidOrderTotals(rows: readonly OrderTotalInput[]): PaidOrderTotals {
  let paidOrderCount = 0;
  let paidCents = 0;
  let refundedCents = 0;

  for (const row of rows) {
    if (row.status === "completed") {
      paidOrderCount += 1;
      paidCents += row.amountCents;
    } else if (row.status === "refunded") {
      refundedCents += row.amountCents;
    }
  }

  return { paidOrderCount, paidCents, refundedCents };
}
