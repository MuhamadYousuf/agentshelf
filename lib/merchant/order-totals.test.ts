import { describe, expect, it } from "vitest";
import { aggregatePaidOrderTotals } from "./order-totals";

describe("aggregatePaidOrderTotals", () => {
  it("counts and sums completed orders only, with refunds shown separately", () => {
    expect(aggregatePaidOrderTotals([
      { status: "completed", amountCents: 2_380 },
      { status: "completed", amountCents: 1_000 },
      { status: "refunded", amountCents: 2_380 },
      { status: "failed", amountCents: 7_000 },
      { status: "cancelled", amountCents: 9_000 },
      { status: "approval_required", amountCents: 4_000 },
    ])).toEqual({ paidOrderCount: 2, paidCents: 3_380, refundedCents: 2_380 });
  });

  it("aggregates only the rows passed from the active filtered view", () => {
    const allRows = [
      { status: "completed", amountCents: 2_380, channel: "agent" },
      { status: "completed", amountCents: 2_700, channel: "storefront" },
      { status: "refunded", amountCents: 1_500, channel: "agent" },
    ];
    const filteredRows = allRows.filter((row) => row.channel === "agent");

    expect(aggregatePaidOrderTotals(filteredRows)).toEqual({
      paidOrderCount: 1,
      paidCents: 2_380,
      refundedCents: 1_500,
    });
  });

  it("returns a zero total for an empty filtered view", () => {
    expect(aggregatePaidOrderTotals([])).toEqual({ paidOrderCount: 0, paidCents: 0, refundedCents: 0 });
  });
});
