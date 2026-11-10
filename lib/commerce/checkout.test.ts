import { describe, expect, it, vi } from "vitest";
import { checkout, type CheckoutDependencies, type CheckoutOrder } from "./checkout";
import type { QuoteRecord } from "./quotes";

vi.mock("@/lib/env", () => ({ getAppUrl: () => "https://shop.example.test" }));

describe("checkout idempotency", () => {
  it("creates one PayPal order for the same quote and reuses its approval link", async () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const quote = {
      id: "quote-1",
      negotiationId: null,
      productId: "product-1",
      merchantId: "merchant-1",
      passId: null,
      qty: 2,
      unitPriceCents: 2_400,
      totalCents: 4_800,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
      signature: "signature",
      usedAt: null,
      createdAt: now,
    } satisfies QuoteRecord;
    let storedOrder: CheckoutOrder | undefined;
    const createPayPal = vi.fn(async () => ({ id: "paypal-order-1", approveUrl: "https://paypal.example.test/approve" }));
    const dependencies: CheckoutDependencies = {
      expireStaleReservations: async () => 0,
      getExisting: async () => storedOrder,
      verifyQuote: async () => quote,
      createOrderRow: async (rowQuote, agentClient, flow) => {
        void agentClient;
        void flow;
        if (storedOrder) return { order: storedOrder, created: false };
        storedOrder = {
          id: "our-order-1",
          quoteId: rowQuote.id,
          merchantId: rowQuote.merchantId,
          productId: rowQuote.productId,
          paypalOrderId: null,
          status: "approval_required",
          amountCents: rowQuote.totalCents,
          qty: rowQuote.qty,
        };
        return { order: storedOrder, created: true };
      },
      loadCheckoutData: async () => ({
        product: { title: "Stoneware mug", description: "Hand-glazed ceramic mug." },
        merchant: { paypalEmail: "merchant@example.test" },
      }),
      createPayPal,
      getPayPalOrder: async () => ({ id: "paypal-order-1", links: [{ rel: "payer-action", href: "https://paypal.example.test/approve" }] }),
      savePaypalOrder: async (orderId, paypalOrderId) => {
        if (!storedOrder || storedOrder.id !== orderId) throw new Error("Order not found.");
        storedOrder = { ...storedOrder, paypalOrderId, status: "approval_required" };
      },
      failOrder: async () => true,
      recordFailure: async () => undefined,
    };

    const first = await checkout({ quoteId: quote.id, agentClient: "storefront", flow: "approval_link" }, dependencies);
    const second = await checkout({ quoteId: quote.id, agentClient: "storefront", flow: "approval_link" }, dependencies);

    expect(first).toEqual({ orderId: "our-order-1", status: "APPROVAL_REQUIRED", approveUrl: "https://paypal.example.test/approve" });
    expect(second).toEqual(first);
    expect(createPayPal).toHaveBeenCalledTimes(1);
  });
});
