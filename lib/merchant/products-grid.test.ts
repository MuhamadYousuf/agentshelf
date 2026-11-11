import { describe, expect, it } from "vitest";
import {
  buildProductGridSummary,
  mapProductsForGrid,
  validateProductGridEdit,
  type ProductGridRow,
} from "./products-grid";

const row = (overrides: Partial<ProductGridRow> = {}): ProductGridRow => ({
  id: "product-1",
  title: "Hand-glazed mug",
  category: "ceramics",
  status: "published",
  listPriceCents: 3_200,
  floorPriceCents: 2_700,
  listPriceDollars: 32,
  floorPriceDollars: 27,
  stock: 4,
  reserved: 1,
  paypalProductId: "PAYPAL-PRODUCT-1",
  thumbnailUrl: "/api/images/image-1",
  updatedAt: "2026-11-12T00:00:00.000Z",
  ...overrides,
});

describe("product grid helpers", () => {
  it("maps thumbnail, dates, prices, and catalog fields for the grid", () => {
    const [mapped] = mapProductsForGrid([{
      id: "p1", title: "Mug", category: "ceramics", status: "draft", listPriceCents: 2_800,
      floorPriceCents: 2_300, stock: 3, reserved: 1, paypalProductId: null,
      images: [{ id: "img1" }], updatedAt: new Date("2026-11-12T00:00:00.000Z"),
    }]);
    expect(mapped).toMatchObject({ thumbnailUrl: "/api/images/img1", listPriceDollars: 28, floorPriceDollars: 23, paypalProductId: null });
  });

  it("accepts valid edits and rejects cents, floor, and reserved-stock violations", () => {
    const current = { listPriceCents: 3_200, floorPriceCents: 2_700, stock: 4, reserved: 2 };
    expect(validateProductGridEdit({ current, field: "listPriceCents", value: 3_300 })).toEqual({ ok: true });
    expect(validateProductGridEdit({ current, field: "listPriceCents", value: 3_200.5 }).ok).toBe(false);
    expect(validateProductGridEdit({ current, field: "floorPriceCents", value: 3_300 })).toMatchObject({ ok: false });
    expect(validateProductGridEdit({ current, field: "stock", value: 1 })).toMatchObject({ ok: false });
  });

  it("summarizes published count and list-price stock value only", () => {
    const summary = buildProductGridSummary([
      row(),
      row({ id: "product-2", listPriceCents: 1_500, stock: 3 }),
      row({ id: "draft", status: "draft", listPriceCents: 9_000, stock: 10 }),
    ]);
    expect(summary).toMatchObject({ publishedCount: 2, stockValueCents: 17_300, stock: 7, reserved: 2 });
  });
});
