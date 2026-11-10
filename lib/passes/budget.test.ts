import { describe, expect, it } from "vitest";
import { canReservePassBudget, evaluatePassPurchase, PassUseError, remainingPassBudget, transitionPassBudget } from "./budget";

const mandate = {
  perOrderMaxCents: 5_000,
  totalBudgetCents: 20_000,
  expiresAt: "2030-01-01T00:00:00.000Z",
  categories: ["ceramics", "textiles"],
  stepUpOverCents: 4_000,
};

describe("Agent Pass mandate checks", () => {
  it("allows an eligible under-threshold order within both limits", () => {
    expect(evaluatePassPurchase({
      mandate,
      category: "ceramics",
      amountCents: 3_500,
      spentCents: 4_000,
      pendingCents: 1_000,
      now: new Date("2026-11-11T00:00:00.000Z"),
    })).toEqual({ flow: "agent_pass", remainingCents: 11_500 });
  });

  it("requires PayPal approval above the configured step-up threshold", () => {
    expect(evaluatePassPurchase({
      mandate,
      category: "textiles",
      amountCents: 4_500,
      spentCents: 0,
      pendingCents: 0,
      now: new Date("2026-11-11T00:00:00.000Z"),
    }).flow).toBe("approval_link");
  });

  it("enforces categories, per-order, expiry and remaining budget", () => {
    const base = { mandate, category: "ceramics", amountCents: 5_100, spentCents: 0, pendingCents: 0, now: new Date("2026-11-11T00:00:00.000Z") };
    expect(() => evaluatePassPurchase(base)).toThrowError(PassUseError);
    expect(() => evaluatePassPurchase({ ...base, amountCents: 100, category: "beauty" })).toThrow("outside the categories");
    expect(() => evaluatePassPurchase({ ...base, amountCents: 100, pendingCents: 19_950 })).toThrow("Remaining budget: $0.50");
    expect(() => evaluatePassPurchase({ ...base, amountCents: 100, now: new Date("2030-01-01T00:00:00.000Z") })).toThrow("has expired");
  });

  it("reserves budget atomically under concurrent spends", async () => {
    const totalBudgetCents = 10_000;
    let pendingCents = 0;
    let queue = Promise.resolve();
    const reserve = () => {
      let allowed = false;
      const operation = queue.then(() => {
        allowed = canReservePassBudget({
          totalBudgetCents,
          spentCents: 0,
          pendingCents,
          amountCents: 4_000,
        });
        if (allowed) pendingCents += 4_000;
      });
      queue = operation;
      return operation.then(() => allowed);
    };

    const results = await Promise.all(Array.from({ length: 5 }, reserve));
    expect(results.filter(Boolean)).toHaveLength(2);
    expect(remainingPassBudget(totalBudgetCents, 0, pendingCents)).toBe(2_000);
  });

  it("moves a reservation to spent after capture and releases it on failure", () => {
    const reserved = transitionPassBudget({ spentCents: 1_000, pendingCents: 2_000, amountCents: 1_500, action: "reserve", totalBudgetCents: 10_000 });
    expect(reserved).toEqual({ spentCents: 1_000, pendingCents: 3_500 });
    const committed = transitionPassBudget({ ...reserved!, amountCents: 1_500, action: "commit" });
    expect(committed).toEqual({ spentCents: 2_500, pendingCents: 2_000 });
    const released = transitionPassBudget({ ...reserved!, amountCents: 1_500, action: "release" });
    expect(released).toEqual({ spentCents: 1_000, pendingCents: 2_000 });
    expect(transitionPassBudget({ spentCents: 2_500, pendingCents: 0, amountCents: 1_500, action: "commit" })).toBeUndefined();
  });
});
