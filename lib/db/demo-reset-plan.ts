export type ResettableOrder = {
  id: string;
  merchantId: string;
  quoteId: string;
  status: string;
  isDemo: boolean;
  buyerNote: string | null;
  createdAt: Date;
};

export type ResettableNegotiation = {
  id: string;
  merchantId: string;
  isDemo: boolean;
};

export type ResettableQuote = {
  id: string;
  merchantId: string;
  negotiationId: string | null;
};

export type DemoDeletionPlan = {
  merchantIds: string[];
  orderIds: string[];
  reservationOrderIds: string[];
  negotiationIds: string[];
  quoteIds: string[];
};

/** Pure guard used by the reset script and tests. Completed/refunded rows are immutable. */
export function buildDemoDeletionPlan(input: {
  merchantIds: string[];
  orders: ResettableOrder[];
  negotiations: ResettableNegotiation[];
  quotes: ResettableQuote[];
  now: Date;
}): DemoDeletionPlan {
  const merchantIds = [...new Set(input.merchantIds)];
  const merchantSet = new Set(merchantIds);
  const staleApprovalCutoff = input.now.getTime() - 60 * 60_000;
  const deletableOrders = input.orders.filter((row) => {
    if (!merchantSet.has(row.merchantId)) return false;
    if (row.isDemo) return true;
    if (row.status === "completed" || row.status === "refunded") return false;
    return row.status === "failed" ||
      row.buyerNote === "cancelled" ||
      row.buyerNote === "expired" ||
      (row.status === "approval_required" && row.createdAt.getTime() <= staleApprovalCutoff);
  });
  const orderIds = deletableOrders.map((row) => row.id);
  const reservationOrderIds = deletableOrders
    .filter((row) => row.status === "created" || row.status === "approval_required" || row.status === "approved")
    .map((row) => row.id);
  const deletedOrderSet = new Set(orderIds);
  const orderQuoteSet = new Set(deletableOrders.map((row) => row.quoteId));
  const protectedQuoteSet = new Set(input.orders
    .filter((row) => merchantSet.has(row.merchantId) && !deletedOrderSet.has(row.id))
    .map((row) => row.quoteId));
  const protectedNegotiationSet = new Set(input.quotes
    .filter((row) => protectedQuoteSet.has(row.id) && row.negotiationId !== null)
    .map((row) => row.negotiationId!));
  const demoNegotiations = input.negotiations.filter((row) =>
    merchantSet.has(row.merchantId) && row.isDemo && !protectedNegotiationSet.has(row.id));
  const negotiationIds = demoNegotiations.map((row) => row.id);
  const negotiationSet = new Set(negotiationIds);
  const quoteIds = input.quotes
    .filter((row) => merchantSet.has(row.merchantId) &&
      (orderQuoteSet.has(row.id) || (row.negotiationId !== null && negotiationSet.has(row.negotiationId))))
    .filter((row) => {
      // If an order somehow still references this quote, never delete it unless that order is also removed.
      const linked = input.orders.find((order) => order.quoteId === row.id);
      return !linked || deletedOrderSet.has(linked.id);
    })
    .map((row) => row.id);

  return { merchantIds, orderIds, reservationOrderIds, negotiationIds, quoteIds };
}
