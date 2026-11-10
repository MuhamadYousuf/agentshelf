import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getQuoteSigningSecret } from "@/lib/env";
import { getDb } from "@/lib/db";
import { merchants, products, quotes, type ProductAttributes } from "@/lib/db/schema";
import { availableStock, effectiveFloorCents, validateQuantity } from "./policy";

export type QuoteRecord = typeof quotes.$inferSelect;

type SignedQuote = {
  id: string;
  productId: string;
  merchantId: string;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
  passId: string | null;
  expiresAt: string;
};

type ProductPolicyRow = {
  id: string;
  merchantId: string;
  status: "draft" | "published" | "blocked" | "archived";
  title: string;
  description: string;
  attributes: ProductAttributes;
  listPriceCents: number;
  floorPriceCents: number;
  costCents: number | null;
  maxDiscountPct: number | null;
  stock: number;
  reserved: number;
  merchantMaxDiscountPct: number;
};

export type QuoteStore = {
  getPricingProduct(productId: string, merchantId: string): Promise<ProductPolicyRow | undefined>;
  insertQuote(values: typeof quotes.$inferInsert): Promise<QuoteRecord>;
  getQuote(id: string): Promise<QuoteRecord | undefined>;
  isPublished(productId: string): Promise<boolean>;
  consume(id: string, now: Date): Promise<QuoteRecord | undefined>;
};

export class QuoteError extends Error {
  constructor(readonly code: "NOT_FOUND" | "INVALID" | "EXPIRED" | "USED" | "TAMPERED") {
    super(quoteErrorMessage(code));
    this.name = "QuoteError";
  }
}

function quoteErrorMessage(code: QuoteError["code"]): string {
  switch (code) {
    case "NOT_FOUND": return "Quote not found.";
    case "INVALID": return "Quote details are not valid for this listing.";
    case "EXPIRED": return "This quote has expired. Request a fresh quote.";
    case "USED": return "This quote has already been used.";
    case "TAMPERED": return "Quote verification failed.";
  }
}

export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJSON(entry)).join(",")}]`;
  const object = value as Record<string, unknown>;
  const entries = Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJSON(object[key])}`);
  return `{${entries.join(",")}}`;
}

export function signedQuotePayload(quote: Pick<QuoteRecord,
  "id" | "productId" | "merchantId" | "qty" | "unitPriceCents" | "totalCents" | "passId" | "expiresAt"
>): SignedQuote {
  return {
    id: quote.id,
    productId: quote.productId,
    merchantId: quote.merchantId,
    qty: quote.qty,
    unitPriceCents: quote.unitPriceCents,
    totalCents: quote.totalCents,
    passId: quote.passId,
    expiresAt: quote.expiresAt.toISOString(),
  };
}

export function signQuote(quote: SignedQuote, secret = getQuoteSigningSecret()): string {
  return createHmac("sha256", secret).update(canonicalJSON(quote)).digest("base64url");
}

export function signaturesMatch(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, "base64url");
  const actualBytes = Buffer.from(actual, "base64url");
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

const databaseQuoteStore: QuoteStore = {
  async getPricingProduct(productId, merchantId) {
    const [row] = await getDb().select({
      id: products.id,
      merchantId: products.merchantId,
      status: products.status,
      title: products.title,
      description: products.description,
      attributes: products.attributes,
      listPriceCents: products.listPriceCents,
      floorPriceCents: products.floorPriceCents,
      costCents: products.costCents,
      maxDiscountPct: products.maxDiscountPct,
      stock: products.stock,
      reserved: products.reserved,
      merchantMaxDiscountPct: merchants.maxDiscountPct,
    }).from(products)
      .innerJoin(merchants, eq(products.merchantId, merchants.id))
      .where(and(eq(products.id, productId), eq(products.merchantId, merchantId)))
      .limit(1);
    return row;
  },
  async insertQuote(values) {
    const [created] = await getDb().insert(quotes).values(values).returning();
    if (!created) throw new Error("Quote was not created.");
    return created;
  },
  async getQuote(id) {
    const [quote] = await getDb().select().from(quotes).where(eq(quotes.id, id)).limit(1);
    return quote;
  },
  async isPublished(productId) {
    const [product] = await getDb().select({ id: products.id }).from(products)
      .where(and(eq(products.id, productId), eq(products.status, "published"))).limit(1);
    return Boolean(product);
  },
  async consume(id, now) {
    const [quote] = await getDb().update(quotes).set({ usedAt: now })
      .where(and(eq(quotes.id, id), isNull(quotes.usedAt), gt(quotes.expiresAt, now)))
      .returning();
    return quote;
  },
};

export async function issueQuote(input: {
  negotiationId?: string;
  productId: string;
  merchantId: string;
  qty: number;
  unitPriceCents: number;
  passId?: string;
}, store: QuoteStore = databaseQuoteStore, now = new Date()): Promise<QuoteRecord> {
  const product = await store.getPricingProduct(input.productId, input.merchantId);
  if (!product || product.status !== "published") throw new QuoteError("NOT_FOUND");
  validateQuantity(input.qty, availableStock(product));
  const floorCents = effectiveFloorCents(product, { maxDiscountPct: product.merchantMaxDiscountPct });
  if (
    !Number.isInteger(input.unitPriceCents) ||
    input.unitPriceCents < floorCents ||
    input.unitPriceCents > product.listPriceCents
  ) throw new QuoteError("INVALID");

  const payload: SignedQuote = {
    id: randomUUID(),
    productId: product.id,
    merchantId: product.merchantId,
    qty: input.qty,
    unitPriceCents: input.unitPriceCents,
    totalCents: input.qty * input.unitPriceCents,
    passId: input.passId ?? null,
    expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
  };
  const signature = signQuote(payload);
  return store.insertQuote({
    id: payload.id,
    negotiationId: input.negotiationId ?? null,
    productId: payload.productId,
    merchantId: payload.merchantId,
    passId: payload.passId,
    qty: payload.qty,
    unitPriceCents: payload.unitPriceCents,
    totalCents: payload.totalCents,
    expiresAt: new Date(payload.expiresAt),
    signature,
  });
}

export async function verifyQuote(id: string, store: QuoteStore = databaseQuoteStore, now = new Date()): Promise<QuoteRecord> {
  const quote = await store.getQuote(id);
  if (!quote) throw new QuoteError("NOT_FOUND");
  const expected = signQuote(signedQuotePayload(quote));
  if (!signaturesMatch(expected, quote.signature)) throw new QuoteError("TAMPERED");
  if (quote.expiresAt.getTime() <= now.getTime()) throw new QuoteError("EXPIRED");
  if (quote.usedAt) throw new QuoteError("USED");
  if (!(await store.isPublished(quote.productId))) throw new QuoteError("INVALID");
  if (
    !Number.isInteger(quote.qty) || quote.qty < 1 || quote.qty > 10 ||
    !Number.isInteger(quote.unitPriceCents) || quote.unitPriceCents < 1 ||
    quote.totalCents !== quote.qty * quote.unitPriceCents
  ) throw new QuoteError("TAMPERED");
  return quote;
}

export async function consumeQuote(id: string, store: QuoteStore = databaseQuoteStore, now = new Date()): Promise<QuoteRecord> {
  const quote = await store.consume(id, now);
  if (!quote) throw new QuoteError("USED");
  return quote;
}
