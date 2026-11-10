import { describe, expect, it } from "vitest";
import { clampListingPrices } from "./prices";

describe("clampListingPrices", () => {
  it("bounds the list price and defaults an invalid floor to 80 percent", () => {
    expect(clampListingPrices(600_000, 100)).toEqual({
      listPriceCents: 500_000,
      floorPriceCents: 400_000,
    });
  });

  it("uses a safe default for invalid list and floor values", () => {
    expect(clampListingPrices("not a price", 1)).toEqual({
      listPriceCents: 3_200,
      floorPriceCents: 2_560,
    });
  });

  it("preserves a valid floor between half and all of list", () => {
    expect(clampListingPrices(4_000, 2_400)).toEqual({
      listPriceCents: 4_000,
      floorPriceCents: 2_400,
    });
  });
});
