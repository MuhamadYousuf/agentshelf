import { describe, expect, it } from "vitest";
import { dollarsToCents, publishProductSchema } from "./product-input";

const validProduct = {
  title: "Hand-glazed mug",
  description: "A stoneware mug with a cream glaze. Wheel-thrown in small batches.",
  category: "ceramics",
  attributes: { material: "Stoneware" },
  tags: ["mug"],
  listPriceCents: 3_200,
  floorPriceCents: 2_700,
  stock: 18,
  maxDiscountPct: 15,
};

describe("publishProductSchema", () => {
  it("accepts valid merchant prices and inventory", () => {
    expect(publishProductSchema.safeParse(validProduct).success).toBe(true);
  });

  it.each([
    [{ ...validProduct, listPriceCents: 99 }],
    [{ ...validProduct, floorPriceCents: 3_201 }],
    [{ ...validProduct, floorPriceCents: 0 }],
    [{ ...validProduct, stock: 1_000 }],
    [{ ...validProduct, maxDiscountPct: 51 }],
    [{ ...validProduct, title: "no" }],
  ])("rejects invalid publish values", (input) => {
    expect(publishProductSchema.safeParse(input).success).toBe(false);
  });
});

describe("dollarsToCents", () => {
  it("converts exact dollar input and rejects extra precision", () => {
    expect(dollarsToCents("32.5")).toBe(3_250);
    expect(dollarsToCents("32.50")).toBe(3_250);
    expect(Number.isNaN(dollarsToCents("32.501"))).toBe(true);
  });
});
