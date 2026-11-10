import "server-only";

import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getAppUrl } from "@/lib/env";
import { getDb } from "@/lib/db";
import { buyerPasses, events, merchants, orders, products, quotes } from "@/lib/db/schema";
import { completeOrderOnce, expireStaleReservations, failOrderAndRelease, InventoryError } from "./inventory";
import { signQuote, signedQuotePayload, verifyQuote, type QuoteRecord } from "./quotes";
import { canReservePassBudget, evaluatePassPurchase, PassUseError, remainingPassBudget } from "@/lib/passes/budget";
import { createOrder, createVaultOrder, getOrder, captureOrder, type ParsedPayPalCapture, type PayPalOrderResponse } from "@/lib/paypal/orders";
import { createPayout, type PayPalPayoutResponse } from "@/lib/paypal/payouts";
import { PayPalError } from "@/lib/paypal/client";

export type CheckoutOrder = {
  id: string;
  quoteId: string;
  merchantId: string;
  productId: string;
  paypalOrderId: string | null;
  status: "created" | "approval_required" | "approved" | "completed" | "refunded" | "failed";
  amountCents: number;
  qty: number;
  flow?: "approval_link" | "agent_pass";
  passId?: string | null;
  payoutStatus?: string | null;
  netCents?: number | null;
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
  receiptUrl?: string;
  paidWith?: "PayPal" | "Agent Pass";
  payoutStatus?: string | null;
  note?: string;
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

type AgentPassCheckoutPass = Pick<
  typeof buyerPasses.$inferSelect,
  "id" | "status" | "revokedAt" | "vaultId" | "mandate" | "spentCents" | "pendingCents"
>;

type PassCheckoutData = {
  category: string;
  product: { title: string; description: string };
  merchant: { paypalEmail: string };
};

export type AgentPassCheckoutDependencies = {
  expireStaleReservations(): Promise<number>;
  getExisting(quoteId: string): Promise<CheckoutOrder | undefined>;
  verifyQuote(id: string): Promise<QuoteRecord>;
  getPass(passId: string): Promise<AgentPassCheckoutPass | undefined>;
  loadCheckoutData(productId: string, merchantId: string): Promise<PassCheckoutData | undefined>;
  bindQuoteToPass(quote: QuoteRecord, passId: string): Promise<QuoteRecord>;
  reserveAndCreate(quote: QuoteRecord, pass: AgentPassCheckoutPass, agentClient: string): Promise<StoredOrder>;
  createVaultPayPal(input: Parameters<typeof createVaultOrder>[0]): ReturnType<typeof createVaultOrder>;
  capturePayPal(id: string, requestId: string): ReturnType<typeof captureOrder>;
  getPayPalOrder(id: string): Promise<PayPalOrderResponse>;
  savePaypalOrder(orderId: string, paypalOrderId: string): Promise<void>;
  completeOrder(orderId: string, paypalOrderId: string, capture: ParsedPayPalCapture): Promise<boolean>;
  failOrder(orderId: string): Promise<boolean>;
  createPayout(input: Parameters<typeof createPayout>[0]): Promise<PayPalPayoutResponse>;
  savePayout(orderId: string, merchantId: string, payout: PayPalPayoutResponse): Promise<string>;
  failPayout(orderId: string, merchantId: string, debugId?: string): Promise<void>;
  approvalCheckout(quoteId: string, agentClient: string): Promise<CheckoutResult>;
};

const databaseAgentPassCheckoutDependencies: AgentPassCheckoutDependencies = {
  expireStaleReservations,
  async getExisting(quoteId) {
    const [row] = await getDb().select().from(orders).where(eq(orders.quoteId, quoteId)).limit(1);
    return row;
  },
  verifyQuote,
  async getPass(passId) {
    const [row] = await getDb().select({
      id: buyerPasses.id,
      status: buyerPasses.status,
      revokedAt: buyerPasses.revokedAt,
      vaultId: buyerPasses.vaultId,
      mandate: buyerPasses.mandate,
      spentCents: buyerPasses.spentCents,
      pendingCents: buyerPasses.pendingCents,
    }).from(buyerPasses).where(eq(buyerPasses.id, passId)).limit(1);
    return row;
  },
  async loadCheckoutData(productId, merchantId) {
    const [row] = await getDb().select({
      category: products.category,
      productTitle: products.title,
      productDescription: products.description,
      paypalEmail: merchants.paypalEmail,
    }).from(products).innerJoin(merchants, eq(products.merchantId, merchants.id))
      .where(and(eq(products.id, productId), eq(products.merchantId, merchantId)))
      .limit(1);
    if (!row) return undefined;
    return {
      category: row.category,
      product: { title: row.productTitle, description: row.productDescription },
      merchant: { paypalEmail: row.paypalEmail },
    };
  },
  async bindQuoteToPass(quote, passId) {
    if (quote.passId === passId) return quote;
    if (quote.passId !== null) throw new PassUseError("INVALID");
    const signature = signQuote(signedQuotePayload({ ...quote, passId }));
    const [bound] = await getDb().update(quotes).set({ passId, signature }).where(and(
      eq(quotes.id, quote.id),
      isNull(quotes.passId),
      isNull(quotes.usedAt),
      eq(quotes.signature, quote.signature),
      gt(quotes.expiresAt, new Date()),
    )).returning();
    if (bound) return bound;
    const [current] = await getDb().select().from(quotes).where(eq(quotes.id, quote.id)).limit(1);
    if (current?.passId === passId) return verifyQuote(quote.id);
    throw new CheckoutError("FAILED");
  },
  async reserveAndCreate(quote, pass, agentClient) {
    const db = getDb();
    return db.transaction(async (tx): Promise<StoredOrder> => {
      const [existing] = await tx.select().from(orders).where(eq(orders.quoteId, quote.id)).limit(1);
      if (existing) return { order: existing, created: false };
      if (quote.passId !== null && quote.passId !== pass.id) throw new PassUseError("INVALID");

      const now = new Date();
      const [product] = await tx.select({ category: products.category }).from(products).where(and(
        eq(products.id, quote.productId),
        eq(products.merchantId, quote.merchantId),
        eq(products.status, "published"),
      )).limit(1);
      if (!product) throw new CheckoutError("NOT_FOUND");
      if (!pass.mandate.categories.includes(product.category)) throw new PassUseError("CATEGORY");

      const [budgetReserved] = await tx.update(buyerPasses).set({
        pendingCents: sql`${buyerPasses.pendingCents} + ${quote.totalCents}`,
        updatedAt: now,
      }).where(and(
        eq(buyerPasses.id, pass.id),
        eq(buyerPasses.status, "active"),
        isNull(buyerPasses.revokedAt),
        sql`(${buyerPasses.mandate} ->> 'expiresAt')::timestamptz > ${now.toISOString()}::timestamptz`,
        sql`${buyerPasses.spentCents} + ${buyerPasses.pendingCents} + ${quote.totalCents} <= (${buyerPasses.mandate} ->> 'totalBudgetCents')::integer`,
      )).returning({ id: buyerPasses.id });
      if (!budgetReserved) {
        const [currentPass] = await tx.select().from(buyerPasses).where(eq(buyerPasses.id, pass.id)).limit(1);
        if (!currentPass || currentPass.status !== "active" || currentPass.revokedAt) throw new PassUseError("INVALID");
        if (new Date(currentPass.mandate.expiresAt).getTime() <= now.getTime()) throw new PassUseError("EXPIRED");
        if (!canReservePassBudget({
          totalBudgetCents: currentPass.mandate.totalBudgetCents,
          spentCents: currentPass.spentCents,
          pendingCents: currentPass.pendingCents,
          amountCents: quote.totalCents,
        })) {
          const remaining = remainingPassBudget(currentPass.mandate.totalBudgetCents, currentPass.spentCents, currentPass.pendingCents);
          throw new PassUseError("BUDGET_EXCEEDED", `Agent Pass budget exceeded. Remaining budget: $${(remaining / 100).toFixed(2)}.`);
        }
        throw new PassUseError("INVALID");
      }

      const [reserved] = await tx.update(products).set({
        reserved: sql`${products.reserved} + ${quote.qty}`,
        updatedAt: now,
      }).where(and(
        eq(products.id, quote.productId),
        eq(products.merchantId, quote.merchantId),
        eq(products.status, "published"),
        sql`${products.stock} - ${products.reserved} >= ${quote.qty}`,
      )).returning({ id: products.id });
      if (!reserved) throw new InventoryError("This item just sold out. Choose another listing.");

      if (quote.passId === null) {
        const signature = signQuote(signedQuotePayload({ ...quote, passId: pass.id }));
        const [bound] = await tx.update(quotes).set({ passId: pass.id, signature }).where(and(
          eq(quotes.id, quote.id),
          isNull(quotes.passId),
          isNull(quotes.usedAt),
          eq(quotes.signature, quote.signature),
          gt(quotes.expiresAt, now),
        )).returning({ id: quotes.id });
        if (!bound) throw new CheckoutError("FAILED");
      }
      const [consumed] = await tx.update(quotes).set({ usedAt: now }).where(and(
        eq(quotes.id, quote.id),
        eq(quotes.passId, pass.id),
        isNull(quotes.usedAt),
        gt(quotes.expiresAt, now),
      )).returning({ id: quotes.id });
      if (!consumed) throw new CheckoutError("FAILED");

      const [created] = await tx.insert(orders).values({
        quoteId: quote.id,
        merchantId: quote.merchantId,
        productId: quote.productId,
        passId: pass.id,
        amountCents: quote.totalCents,
        qty: quote.qty,
        flow: "agent_pass",
        agentClient,
        status: "approval_required",
      }).returning();
      if (!created) throw new Error("Agent Pass checkout order was not created.");
      await tx.insert(events).values({
        merchantId: quote.merchantId,
        type: "checkout.created",
        source: "agent",
        payload: { orderId: created.id, quoteId: quote.id, productId: quote.productId, qty: quote.qty, flow: "agent_pass" },
      });
      return { order: created, created: true };
    });
  },
  createVaultPayPal: createVaultOrder,
  capturePayPal: captureOrder,
  getPayPalOrder: getOrder,
  async savePaypalOrder(orderId, paypalOrderId) {
    await getDb().update(orders).set({ paypalOrderId, updatedAt: new Date() }).where(and(
      eq(orders.id, orderId),
      inArray(orders.status, ["created", "approval_required"]),
    ));
  },
  async completeOrder(orderId, paypalOrderId, capture) {
    return completeOrderOnce({
      orderId,
      paypalOrderId,
      captureId: capture.captureId,
      paypalFeeCents: capture.feeCents,
      netCents: capture.netCents,
      buyerEmail: capture.payerEmail,
      shipping: capture.shipping,
    });
  },
  async failOrder(orderId) {
    return failOrderAndRelease({ orderId, reason: "failed" });
  },
  createPayout,
  async savePayout(orderId, merchantId, payout) {
    const batchId = payout.batch_header?.payout_batch_id;
    const status = payout.batch_header?.batch_status;
    if (!batchId || !status) throw new Error("PayPal did not return a payout batch status.");
    await getDb().update(orders).set({ payoutBatchId: batchId, payoutStatus: status, updatedAt: new Date() })
      .where(eq(orders.id, orderId));
    await getDb().insert(events).values({
      merchantId,
      type: "payout.sent",
      source: "system",
      payload: { orderId, payoutBatchId: batchId, payoutStatus: status },
    });
    return status;
  },
  async failPayout(orderId, merchantId, debugId) {
    await getDb().update(orders).set({ payoutStatus: "FAILED", updatedAt: new Date() }).where(eq(orders.id, orderId));
    await getDb().insert(events).values({
      merchantId,
      type: "payout.failed",
      source: "system",
      payload: { orderId, ...(debugId ? { debugId } : {}) },
    }).catch(() => undefined);
  },
  async approvalCheckout(quoteId, agentClient) {
    return checkout({ quoteId, agentClient, flow: "approval_link" });
  },
};

function assertPassCanSpend(pass: AgentPassCheckoutPass | undefined): asserts pass is AgentPassCheckoutPass & { vaultId: string } {
  if (!pass || pass.status !== "active" || pass.revokedAt || !pass.vaultId) throw new PassUseError("INVALID");
  if (new Date(pass.mandate.expiresAt).getTime() <= Date.now()) throw new PassUseError("EXPIRED");
}

function passCheckoutResult(orderId: string, payoutStatus: string | null, receiptUrl: string): CheckoutResult {
  const note = payoutStatus === "FAILED"
    ? "Paid via PayPal. The merchant payout failed and can be retried from merchant orders. Price includes shipping."
    : "Paid via PayPal. Funds are released to the shop via PayPal Payouts.";
  return { orderId, status: "COMPLETED", paidWith: "Agent Pass", payoutStatus, receiptUrl, note };
}

async function payMerchantForPassOrder(input: {
  orderId: string;
  merchantId: string;
  merchantEmail: string;
  amountCents: number;
  productTitle: string;
  dependencies: AgentPassCheckoutDependencies;
}): Promise<string> {
  try {
    const payout = await input.dependencies.createPayout({
      requestId: `payout-${input.orderId}`,
      receiverEmail: input.merchantEmail,
      amountCents: input.amountCents,
      note: `AgentShelf agent sale: ${input.productTitle}`,
    });
    return await input.dependencies.savePayout(input.orderId, input.merchantId, payout);
  } catch (error) {
    await input.dependencies.failPayout(
      input.orderId,
      input.merchantId,
      error instanceof PayPalError ? error.debugId : undefined,
    ).catch(() => undefined);
    return "FAILED";
  }
}

export async function checkoutWithAgentPass(
  input: { quoteId: string; agentClient: string; passId: string },
  dependencies: AgentPassCheckoutDependencies = databaseAgentPassCheckoutDependencies,
): Promise<CheckoutResult> {
  await dependencies.expireStaleReservations();
  const pass = await dependencies.getPass(input.passId);
  assertPassCanSpend(pass);

  const existing = await dependencies.getExisting(input.quoteId);
  if (existing) {
    if (existing.passId && existing.passId !== pass.id) throw new PassUseError("INVALID");
    if (existing.status === "failed") throw new CheckoutError("FAILED");
    if (existing.flow === "approval_link" && existing.status === "approval_required" && existing.paypalOrderId) {
      const order = await dependencies.getPayPalOrder(existing.paypalOrderId);
      const approveUrl = approvalLink(order);
      if (!approveUrl) throw new CheckoutError("NO_APPROVAL");
      return {
        orderId: existing.id,
        status: "APPROVAL_REQUIRED",
        approveUrl,
        paidWith: "PayPal",
        note: "This order is above your Agent Pass step-up limit, so your human needs to approve it.",
      };
    }
    if (existing.status === "completed") {
      const receiptUrl = `${getAppUrl().replace(/\/+$/, "")}/orders/${existing.id}`;
      if (existing.flow !== "agent_pass") {
        return { orderId: existing.id, status: "COMPLETED", paidWith: "PayPal", receiptUrl, note: "PayPal payment completed. Price includes shipping." };
      }
      if (!existing.payoutStatus && existing.netCents && existing.merchantId) {
        const data = await dependencies.loadCheckoutData(existing.productId, existing.merchantId);
        if (data) {
          const payoutStatus = await payMerchantForPassOrder({
            orderId: existing.id,
            merchantId: existing.merchantId,
            merchantEmail: data.merchant.paypalEmail,
            amountCents: existing.netCents,
            productTitle: data.product.title,
            dependencies,
          });
          return passCheckoutResult(existing.id, payoutStatus, receiptUrl);
        }
      }
      return passCheckoutResult(existing.id, existing.payoutStatus ?? null, receiptUrl);
    }
    if (!existing.paypalOrderId) throw new CheckoutError("IN_PROGRESS");
    const capture = await dependencies.capturePayPal(existing.paypalOrderId, `capture-${existing.id}`);
    if (capture.status !== "COMPLETED") throw new CheckoutError("FAILED");
    await dependencies.completeOrder(existing.id, existing.paypalOrderId, capture);
    const data = await dependencies.loadCheckoutData(existing.productId, existing.merchantId);
    if (!data) throw new CheckoutError("NOT_FOUND");
    const payoutStatus = await payMerchantForPassOrder({
      orderId: existing.id,
      merchantId: existing.merchantId,
      merchantEmail: data.merchant.paypalEmail,
      amountCents: capture.netCents,
      productTitle: data.product.title,
      dependencies,
    });
    return passCheckoutResult(existing.id, payoutStatus, `${getAppUrl().replace(/\/+$/, "")}/orders/${existing.id}`);
  }

  const quote = await dependencies.verifyQuote(input.quoteId);
  if (quote.passId !== null && quote.passId !== pass.id) throw new PassUseError("INVALID");
  const data = await dependencies.loadCheckoutData(quote.productId, quote.merchantId);
  if (!data) throw new CheckoutError("NOT_FOUND");
  const passDecision = evaluatePassPurchase({
    mandate: pass.mandate,
    category: data.category,
    amountCents: quote.totalCents,
    spentCents: pass.spentCents,
    pendingCents: pass.pendingCents,
  });
  if (passDecision.flow === "approval_link") {
    await dependencies.bindQuoteToPass(quote, pass.id);
    const result = await dependencies.approvalCheckout(input.quoteId, input.agentClient);
    return {
      ...result,
      paidWith: "PayPal",
      note: "This order is above your Agent Pass step-up limit, so your human needs to approve it.",
    };
  }

  const stored = await dependencies.reserveAndCreate(quote, pass, input.agentClient);
  if (!stored.created) {
    if (stored.order.status === "completed") {
      return passCheckoutResult(
        stored.order.id,
        stored.order.payoutStatus ?? null,
        `${getAppUrl().replace(/\/+$/, "")}/orders/${stored.order.id}`,
      );
    }
    throw new CheckoutError("IN_PROGRESS");
  }

  let captured = false;
  try {
    const appUrl = getAppUrl().replace(/\/+$/, "");
    const paypalOrder = await dependencies.createVaultPayPal({
      requestId: `order-${quote.id}`,
      vaultId: pass.vaultId,
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
    const capture = paypalOrder.status === "COMPLETED" && paypalOrder.capture
      ? paypalOrder.capture
      : await dependencies.capturePayPal(paypalOrder.id, `capture-${stored.order.id}`);
    if (capture.status !== "COMPLETED") throw new CheckoutError("FAILED");
    captured = true;
    await dependencies.completeOrder(stored.order.id, paypalOrder.id, capture);
    const payoutStatus = await payMerchantForPassOrder({
      orderId: stored.order.id,
      merchantId: quote.merchantId,
      merchantEmail: data.merchant.paypalEmail,
      amountCents: capture.netCents,
      productTitle: data.product.title,
      dependencies,
    });
    return passCheckoutResult(
      stored.order.id,
      payoutStatus,
      `${appUrl}/orders/${stored.order.id}`,
    );
  } catch (error) {
    if (!captured) await dependencies.failOrder(stored.order.id).catch(() => false);
    if (error instanceof InventoryError || error instanceof CheckoutError || error instanceof PassUseError) throw error;
    throw error;
  }
}
