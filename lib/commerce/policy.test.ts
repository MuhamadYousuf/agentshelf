import { describe, expect, it } from "vitest";
import { availableStock, effectiveFloorCents, priceWithMerchantPolicy, validateQuantity } from "./policy";

describe("merchant pricing policy", () => {
  it("honors the stricter product or merchant floor", () => {
    expect(effectiveFloorCents({ listPriceCents: 10_000, floorPriceCents: 7_000, maxDiscountPct: 15 }, { maxDiscountPct: 20 })).toBe(8_500);
    expect(effectiveFloorCents({ listPriceCents: 10_000, floorPriceCents: 9_200, maxDiscountPct: null }, { maxDiscountPct: 15 })).toBe(9_200);
  });

  it("subtracts reservations and enforces quantities from one to ten", () => {
    expect(availableStock({ stock: 5, reserved: 2 })).toBe(3);
    expect(() => validateQuantity(3, 3)).not.toThrow();
    expect(() => validateQuantity(4, 3)).toThrow(/not enough stock/i);
    expect(() => validateQuantity(11)).toThrow(/1 to 10/i);
  });

  it("respects a merchant's manual acceptance setting while retaining the offer", () => {
    const input = {
      product: {
        listPriceCents: 10_000,
        floorPriceCents: 6_000,
        costCents: 5_500,
        maxDiscountPct: 15,
        stock: 5,
        reserved: 0,
      },
      merchant: { autoAccept: false, maxDiscountPct: 15 },
      state: { belief: 0.5, state: "cooperate" as const, round: 0, lastOfferCents: null },
      buyerMove: { type: "counter" as const, priceCents: 10_000 },
    };
    const decision = priceWithMerchantPolicy(input);
    expect(decision.action).toBe("offer");
    expect(decision.trace.reason).toBe("auto_accept_disabled→buyer_accept→cooperate (Alg.3)");
  });
});
