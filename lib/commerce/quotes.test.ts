import { describe, expect, it, vi } from "vitest";
import { QuoteError, canonicalJSON, consumeQuote, issueQuote, verifyQuote, type QuoteRecord, type QuoteStore } from "./quotes";
import { quotes } from "@/lib/db/schema";

vi.mock("@/lib/env", () => ({ getQuoteSigningSecret: () => "unit-test-quote-secret-0123456789" }));

function memoryStore(now: Date): { store: QuoteStore; records: Map<string, QuoteRecord> } {
  const records = new Map<string, QuoteRecord>();
  const product = {
    id: "prod-1",
    merchantId: "merchant-1",
    status: "published" as const,
    title: "Handmade bowl",
    description: "A small stoneware bowl.",
    attributes: {},
    listPriceCents: 4_000,
    floorPriceCents: 2_000,
    costCents: null,
    maxDiscountPct: null,
    stock: 8,
    reserved: 1,
    merchantMaxDiscountPct: 15,
  };
  const store: QuoteStore = {
    async getPricingProduct(productId, merchantId) {
      return productId === product.id && merchantId === product.merchantId ? product : undefined;
    },
    async insertQuote(values: typeof quotes.$inferInsert) {
      const record = {
        id: values.id ?? "quote-1",
        negotiationId: values.negotiationId ?? null,
        productId: values.productId ?? product.id,
        merchantId: values.merchantId ?? product.merchantId,
        passId: values.passId ?? null,
        qty: values.qty ?? 1,
        unitPriceCents: values.unitPriceCents ?? 3_400,
        totalCents: values.totalCents ?? 3_400,
        expiresAt: values.expiresAt ?? new Date(now.getTime() + 15 * 60_000),
        signature: values.signature ?? "",
        usedAt: values.usedAt ?? null,
        createdAt: values.createdAt ?? now,
      } satisfies QuoteRecord;
      records.set(record.id, record);
      return record;
    },
    async getQuote(id) {
      return records.get(id);
    },
    async isPublished(productId) {
      return productId === product.id;
    },
    async consume(id, consumedAt) {
      const record = records.get(id);
      if (!record || record.usedAt || record.expiresAt <= consumedAt) return undefined;
      record.usedAt = consumedAt;
      return record;
    },
  };
  return { store, records };
}

describe("signed quotes", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");

  it("canonicalizes object key order recursively", () => {
    expect(canonicalJSON({ b: 2, a: { z: 1, y: 0 } })).toBe(canonicalJSON({ a: { y: 0, z: 1 }, b: 2 }));
  });

  it("rejects tampering with each signed field", async () => {
    const { store, records } = memoryStore(now);
    const quote = await issueQuote({
      productId: "prod-1",
      merchantId: "merchant-1",
      qty: 1,
      unitPriceCents: 3_400,
    }, store, now);
    const tamper = [
      (row: QuoteRecord) => { row.productId = "prod-2"; },
      (row: QuoteRecord) => { row.merchantId = "merchant-2"; },
      (row: QuoteRecord) => { row.qty = 2; },
      (row: QuoteRecord) => { row.unitPriceCents += 1; },
      (row: QuoteRecord) => { row.totalCents += 1; },
      (row: QuoteRecord) => { row.passId = "pass-2"; },
      (row: QuoteRecord) => { row.expiresAt = new Date(row.expiresAt.getTime() + 1); },
      (row: QuoteRecord) => { row.id = "quote-other"; },
    ];

    for (const change of tamper) {
      const original = records.get(quote.id);
      if (!original) throw new Error("Missing memory quote.");
      const changed = { ...original };
      change(changed);
      records.set(quote.id, changed);
      await expect(verifyQuote(quote.id, store, now)).rejects.toBeInstanceOf(QuoteError);
      records.set(quote.id, original);
    }
  });

  it("rejects an expired quote", async () => {
    const { store } = memoryStore(now);
    const quote = await issueQuote({ productId: "prod-1", merchantId: "merchant-1", qty: 1, unitPriceCents: 3_400 }, store, now);
    await expect(verifyQuote(quote.id, store, new Date(now.getTime() + 16 * 60_000)))
      .rejects.toMatchObject({ code: "EXPIRED" });
  });

  it("allows the atomic consume once and rejects a second consume", async () => {
    const { store } = memoryStore(now);
    const quote = await issueQuote({ productId: "prod-1", merchantId: "merchant-1", qty: 1, unitPriceCents: 3_400 }, store, now);
    await expect(consumeQuote(quote.id, store, now)).resolves.toMatchObject({ usedAt: now });
    await expect(consumeQuote(quote.id, store, now)).rejects.toMatchObject({ code: "USED" });
  });
});
