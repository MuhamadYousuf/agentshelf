import "server-only";

import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getAppUrl } from "@/lib/env";
import { getDb } from "@/lib/db";
import { events, merchants, orders, products, quotes } from "@/lib/db/schema";
import { expireStaleReservations, failOrderAndRelease, InventoryError } from "./inventory";
import { verifyQuote, type QuoteRecord } from "./quotes";
import { createOrder, getOrder, type PayPalOrderResponse } from "@/lib/paypal/orders";

export type CheckoutOrder = {
  id: string;
  quoteId: string;
  merchantId: string;
  productId: string;
  paypalOrderId: string | null;
  status: "created" | "approval_required" | "approved" | "completed" | "refunded" | "failed";
  amountCents: number;
  qty: number;
};

type CheckoutData = {
  product: { title: string; description: string };
  merchant: { paypalEmail: string };
};

type StoredOrder = { order: CheckoutOrder; created: boolean };

export type CheckoutDependencies = {
  expireStaleReservations(): Promise<number>;
  getExisting(quoteId: string): Promise<CheckoutOrder | undefined>;
  verifyQuote(id: string): Promise<QuoteRecord>;
  createOrderRow(quote: QuoteRecord, agentClient: string, flow: "approval_link"): Promise<StoredOrder>;
  loadCheckoutData(productId: string, merchantId: string): Promise<CheckoutData | undefined>;
  createPayPal(input: Parameters<typeof createOrder>[0]): Promise<{ id: string; approveUrl: string }>;
  getPayPalOrder(id: string): Promise<PayPalOrderResponse>;
  savePaypalOrder(orderId: string, paypalOrderId: string): Promise<void>;
  failOrder(orderId: string): Promise<boolean>;
  recordFailure(quoteId: string, merchantId: string, agentClient: string): Promise<void>;
};

export class CheckoutError extends Error {
  constructor(readonly code: "NOT_FOUND" | "IN_PROGRESS" | "FAILED" | "NO_APPROVAL") {
    super(checkoutMessages[code]);
    this.name = "CheckoutError";
  }
}

const checkoutMessages = {
  NOT_FOUND: "The quote is unavailable. Request a fresh quote.",
  IN_PROGRESS: "Checkout is being prepared. Refresh in a moment.",
  FAILED: "This checkout could not be completed. Start a new checkout.",
  NO_APPROVAL: "PayPal did not provide an approval link for this order.",
} as const;

const databaseDependencies: CheckoutDependencies = {
  expireStaleReservations,
  async getExisting(quoteId) {
    const [row] = await getDb().select().from(orders).where(eq(orders.quoteId, quoteId)).limit(1);
    return row;
  },
  verifyQuote,
  async createOrderRow(quote, agentClient, flow) {
    const db = getDb();
    const result = await db.transaction(async (tx): Promise<StoredOrder> => {
      const [existing] = await tx.select().from(orders).where(eq(orders.quoteId, quote.id)).limit(1);
      if (existing) return { order: existing, created: false };

      const [reserved] = await tx.update(products).set({
        reserved: sql`${products.reserved} + ${quote.qty}`,
        updatedAt: new Date(),
      }).where(and(
        eq(products.id, quote.productId),
        eq(products.merchantId, quote.merchantId),
        eq(products.status, "published"),
        sql`${products.stock} - ${products.reserved} >= ${quote.qty}`,
      )).returning({ id: products.id });
      if (!reserved) throw new InventoryError("This item just sold out. Choose another listing.");

      const [consumed] = await tx.update(quotes).set({ usedAt: new Date() }).where(and(
        eq(quotes.id, quote.id),
        isNull(quotes.usedAt),
        gt(quotes.expiresAt, new Date()),
      )).returning({ id: quotes.id });
      if (!consumed) throw new CheckoutError("FAILED");

      const [created] = await tx.insert(orders).values({
        quoteId: quote.id,
        merchantId: quote.merchantId,
        productId: quote.productId,
        passId: quote.passId,
        amountCents: quote.totalCents,
        qty: quote.qty,
        flow,
        agentClient,
        status: "approval_required",
      }).returning();
      if (!created) throw new Error("Checkout order was not created.");
      await tx.insert(events).values({
        merchantId: quote.merchantId,
        type: "checkout.created",
        source: agentClient === "storefront" ? "merchant" : "agent",
        payload: { orderId: created.id, quoteId: quote.id, productId: quote.productId, qty: quote.qty },
      });
      return { order: created, created: true };
    });
    return result;
  },
  async loadCheckoutData(productId, merchantId) {
    const [row] = await getDb().select({
      productTitle: products.title,
      productDescription: products.description,
      paypalEmail: merchants.paypalEmail,
    }).from(products).innerJoin(merchants, eq(products.merchantId, merchants.id))
      .where(and(eq(products.id, productId), eq(products.merchantId, merchantId)))
      .limit(1);
    if (!row) return undefined;
    return {
      product: { title: row.productTitle, description: row.productDescription },
      merchant: { paypalEmail: row.paypalEmail },
    };
  },
  createPayPal: createOrder,
  getPayPalOrder: getOrder,
  async savePaypalOrder(orderId, paypalOrderId) {
    await getDb().update(orders).set({
      paypalOrderId,
      status: "approval_required",
      updatedAt: new Date(),
    }).where(and(eq(orders.id, orderId), inArray(orders.status, ["created", "approval_required"])));
  },
  async failOrder(orderId) {
    return failOrderAndRelease({ orderId, reason: "failed" });
  },
  async recordFailure(quoteId, merchantId, agentClient) {
    await getDb().insert(events).values({
      merchantId,
      type: "checkout.failed",
      source: agentClient === "storefront" ? "merchant" : "agent",
      payload: { quoteId, reason: "checkout could not be prepared" },
    });
  },
};

function approvalLink(order: PayPalOrderResponse): string | undefined {
  return order.links?.find((link) => link.rel === "payer-action" || link.rel === "approve")?.href;
}

function publicStatus(status: CheckoutOrder["status"]): string {
  return status.replaceAll("_", " ").toUpperCase();
}

async function existingCheckout(
  order: CheckoutOrder,
  dependencies: CheckoutDependencies,
): Promise<CheckoutResult> {
  if (order.status === "failed") throw new CheckoutError("FAILED");
  if ((order.status === "created" || order.status === "approval_required") && !order.paypalOrderId) {
    throw new CheckoutError("IN_PROGRESS");
  }
  if (order.status === "approval_required" && order.paypalOrderId) {
    const paypalOrder = await dependencies.getPayPalOrder(order.paypalOrderId);
    const approveUrl = approvalLink(paypalOrder);
    if (approveUrl) return { orderId: order.id, status: "APPROVAL_REQUIRED", approveUrl };
    throw new CheckoutError("NO_APPROVAL");
  }
  return { orderId: order.id, status: publicStatus(order.status) };
}

export type CheckoutResult = {
  orderId: string;
  status: string;
  approveUrl?: string;
};

export async function checkout(
  input: { quoteId: string; agentClient: string; flow: "approval_link" },
  dependencies: CheckoutDependencies = databaseDependencies,
): Promise<CheckoutResult> {
  await dependencies.expireStaleReservations();

  const previous = await dependencies.getExisting(input.quoteId);
  if (previous) return existingCheckout(previous, dependencies);

  const quote = await dependencies.verifyQuote(input.quoteId);
  let stored: StoredOrder | undefined;
  try {
    stored = await dependencies.createOrderRow(quote, input.agentClient, input.flow);
    if (!stored.created) return existingCheckout(stored.order, dependencies);

    const data = await dependencies.loadCheckoutData(quote.productId, quote.merchantId);
    if (!data) throw new CheckoutError("NOT_FOUND");
    const appUrl = getAppUrl().replace(/\/+$/, "");
    const paypalOrder = await dependencies.createPayPal({
      requestId: `order-${quote.id}`,
      payeeEmail: data.merchant.paypalEmail,
      items: [{
        name: data.product.title,
        description: data.product.description,
        quantity: quote.qty,
        unitAmountCents: quote.unitPriceCents,
      }],
      totalCents: quote.totalCents,
      description: data.product.title,
      returnUrl: `${appUrl}/api/paypal/return?order=${stored.order.id}`,
      cancelUrl: `${appUrl}/api/paypal/cancel?order=${stored.order.id}`,
      referenceId: quote.id,
      customId: stored.order.id,
    });
    await dependencies.savePaypalOrder(stored.order.id, paypalOrder.id);
    return { orderId: stored.order.id, status: "APPROVAL_REQUIRED", approveUrl: paypalOrder.approveUrl };
  } catch (error) {
    if (stored?.created) {
      await dependencies.failOrder(stored.order.id).catch(() => false);
    } else {
      const raced = await dependencies.getExisting(input.quoteId).catch(() => undefined);
      if (raced) return existingCheckout(raced, dependencies);
      await dependencies.recordFailure(quote.id, quote.merchantId, input.agentClient).catch(() => undefined);
    }
    if (error instanceof InventoryError) throw error;
    if (error instanceof CheckoutError) throw error;
    throw error;
  }
}
