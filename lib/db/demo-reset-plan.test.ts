import { describe, expect, it } from "vitest";
import { buildDemoDeletionPlan } from "./demo-reset-plan";

describe("buildDemoDeletionPlan", () => {
  it("only deletes eligible demo-shop rows and preserves paid live history", () => {
    const now = new Date("2026-11-11T12:00:00.000Z");
    const plan = buildDemoDeletionPlan({
      merchantIds: ["maya", "lahore"],
      orders: [
        { id: "demo-completed", merchantId: "maya", quoteId: "q1", status: "completed", isDemo: true, buyerNote: null, createdAt: now },
        { id: "live-completed", merchantId: "maya", quoteId: "q2", status: "completed", isDemo: false, buyerNote: null, createdAt: now },
        { id: "live-refunded", merchantId: "lahore", quoteId: "q3", status: "refunded", isDemo: false, buyerNote: null, createdAt: now },
        { id: "live-failed", merchantId: "lahore", quoteId: "q4", status: "failed", isDemo: false, buyerNote: null, createdAt: now },
        { id: "stale-approval", merchantId: "maya", quoteId: "q5", status: "approval_required", isDemo: false, buyerNote: null, createdAt: new Date(now.getTime() - 61 * 60_000) },
        { id: "fresh-approval", merchantId: "maya", quoteId: "q6", status: "approval_required", isDemo: false, buyerNote: null, createdAt: now },
        { id: "other-failed", merchantId: "other", quoteId: "q7", status: "failed", isDemo: false, buyerNote: null, createdAt: now },
      ],
      negotiations: [
        { id: "demo-neg", merchantId: "maya", isDemo: true },
        { id: "other-neg", merchantId: "other", isDemo: true },
      ],
      quotes: [
        { id: "q1", merchantId: "maya", negotiationId: null },
        { id: "q2", merchantId: "maya", negotiationId: null },
        { id: "q4", merchantId: "lahore", negotiationId: null },
        { id: "q5", merchantId: "maya", negotiationId: "demo-neg" },
      ],
      now,
    });

    expect(plan.orderIds).toEqual(["demo-completed", "live-failed", "stale-approval"]);
    expect(plan.orderIds).not.toContain("live-completed");
    expect(plan.orderIds).not.toContain("live-refunded");
    expect(plan.orderIds).not.toContain("fresh-approval");
    expect(plan.orderIds).not.toContain("other-failed");
    expect(plan.reservationOrderIds).toEqual(["stale-approval"]);
    expect(plan.negotiationIds).toEqual(["demo-neg"]);
    expect(plan.quoteIds).toEqual(["q1", "q4", "q5"]);
  });

  it("preserves a demo negotiation if a protected live receipt references it", () => {
    const now = new Date("2026-11-11T12:00:00.000Z");
    const plan = buildDemoDeletionPlan({
      merchantIds: ["maya"],
      orders: [{ id: "live", merchantId: "maya", quoteId: "quote", status: "completed", isDemo: false, buyerNote: null, createdAt: now }],
      negotiations: [{ id: "neg", merchantId: "maya", isDemo: true }],
      quotes: [{ id: "quote", merchantId: "maya", negotiationId: "neg" }],
      now,
    });
    expect(plan.orderIds).toEqual([]);
    expect(plan.negotiationIds).toEqual([]);
    expect(plan.quoteIds).toEqual([]);
  });
});
