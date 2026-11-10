import { describe, expect, it, vi } from "vitest";
import { checkoutWithAgentPass, type AgentPassCheckoutDependencies, type CheckoutOrder } from "./checkout";
import { PassUseError } from "@/lib/passes/budget";
import type { QuoteRecord } from "./quotes";

vi.mock("@/lib/env", () => ({ getAppUrl: () => "https://agentshelf.test" }));

const quoteId = "cd141823-8eac-4780-bd51-73b913476574";
const productId = "a5d709c7-1f61-4691-a51c-d032891ce11d";
const merchantId = "8bc93b2e-e610-4f18-9e85-0ecaf62dca44";
const passId = "94d0313a-2f22-46fc-8392-8a0fb5b40811";
const orderId = "e02c2852-22eb-4e12-8f01-d6c7456f29aa";

function quote(totalCents = 3_200, pass: string | null = null): QuoteRecord {
  return {
    id: quoteId,
    negotiationId: null,
    productId,
    merchantId,
    passId: pass,
    qty: 1,
    unitPriceCents: totalCents,
    totalCents,
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    signature: "signed",
    usedAt: null,
    createdAt: new Date("2026-11-11T00:00:00.000Z"),
  };
}

function passFixture(overrides: Partial<{
  status: "active" | "revoked";
  revokedAt: Date | null;
  spentCents: number;
  pendingCents: number;
  totalBudgetCents: number;
  perOrderMaxCents: number;
  stepUpOverCents: number;
  categories: string[];
}> = {}) {
  return {
    id: passId,
    status: overrides.status ?? "active" as const,
    revokedAt: overrides.revokedAt ?? null,
    vaultId: "VAULT-1",
    mandate: {
      perOrderMaxCents: overrides.perOrderMaxCents ?? 5_000,
      totalBudgetCents: overrides.totalBudgetCents ?? 20_000,
      expiresAt: "2030-01-01T00:00:00.000Z",
      categories: overrides.categories ?? ["ceramics"],
      stepUpOverCents: overrides.stepUpOverCents ?? 4_000,
    },
    spentCents: overrides.spentCents ?? 0,
    pendingCents: overrides.pendingCents ?? 0,
  };
}

function dependencies(input: {
  quote?: QuoteRecord;
  pass?: ReturnType<typeof passFixture>;
  payoutFails?: boolean;
  createFails?: boolean;
} = {}) {
  const selectedQuote = input.quote ?? quote();
  const selectedPass = input.pass ?? passFixture();
  let existing: CheckoutOrder | undefined;
  let createCount = 0;
  let payoutCount = 0;
  let failCount = 0;
  let completedCount = 0;
  let bindCount = 0;
  let approvalCount = 0;
  const deps: AgentPassCheckoutDependencies = {
    async expireStaleReservations() { return 0; },
    async getExisting() { return existing; },
    async verifyQuote() { return selectedQuote; },
    async getPass() { return selectedPass; },
    async loadCheckoutData() {
      return {
        category: "ceramics",
        product: { title: "Speckled stoneware mug", description: "Wheel-thrown ceramic mug." },
        merchant: { paypalEmail: "maker@example.test" },
      };
    },
    async bindQuoteToPass(current, id) {
      bindCount += 1;
      return { ...current, passId: id };
    },
    async reserveAndCreate(current, _buyerPass, agentClient) {
      existing = {
        id: orderId,
        quoteId: current.id,
        merchantId: current.merchantId,
        productId: current.productId,
        paypalOrderId: null,
        status: "approval_required",
        amountCents: current.totalCents,
        qty: current.qty,
        flow: "agent_pass",
        passId,
        payoutStatus: null,
        netCents: null,
      };
      return { order: { ...existing, agentClient } as CheckoutOrder, created: true };
    },
    async createVaultPayPal() {
      createCount += 1;
      if (input.createFails) throw new Error("mock vault request failed");
      return {
        id: "PAYPAL-VAULT-ORDER",
        status: "COMPLETED",
        capture: {
          captureId: "CAPTURE-VAULT-1",
          status: "COMPLETED",
          grossCents: selectedQuote.totalCents,
          feeCents: 112,
          netCents: selectedQuote.totalCents - 112,
          payerEmail: "buyer@example.test",
          shipping: null,
        },
      };
    },
    async capturePayPal() {
      throw new Error("capture must not be called for a completed Vault order");
    },
    async getPayPalOrder() { return { id: "PAYPAL-VAULT-ORDER" }; },
    async savePaypalOrder(id, paypalOrderId) {
      if (existing?.id === id) existing = { ...existing, paypalOrderId };
    },
    async completeOrder(id, paypalOrderId, capture) {
      completedCount += 1;
      if (existing?.id === id) existing = {
        ...existing,
        paypalOrderId,
        status: "completed",
        netCents: capture.netCents,
      };
      return true;
    },
    async failOrder() {
      failCount += 1;
      if (existing) existing = { ...existing, status: "failed" };
      return true;
    },
    async createPayout() {
      payoutCount += 1;
      if (input.payoutFails) throw new Error("mock payout failure");
      return { batch_header: { payout_batch_id: "PAYOUT-BATCH-1", batch_status: "PENDING" } };
    },
    async savePayout(id, _makerId, payout) {
      const status = payout.batch_header?.batch_status ?? "PENDING";
      if (existing?.id === id) existing = { ...existing, payoutStatus: status };
      return status;
    },
    async failPayout(id) {
      if (existing?.id === id) existing = { ...existing, payoutStatus: "FAILED" };
    },
    async approvalCheckout() {
      approvalCount += 1;
      return { orderId, status: "APPROVAL_REQUIRED", approveUrl: "https://paypal.test/approve" };
    },
  };
  return {
    deps,
    counts: () => ({ createCount, payoutCount, failCount, completedCount, bindCount, approvalCount }),
    order: () => existing,
  };
}

describe("Agent Pass checkout", () => {
  it("completes a vaulted charge, pays out once, and returns the same order on retry", async () => {
    const fixture = dependencies();
    const input = { quoteId, agentClient: "checkout-test", passId };
    const first = await checkoutWithAgentPass(input, fixture.deps);
    const second = await checkoutWithAgentPass(input, fixture.deps);

    expect(first).toMatchObject({
      orderId,
      status: "COMPLETED",
      paidWith: "Agent Pass",
      payoutStatus: "PENDING",
      receiptUrl: `https://agentshelf.test/orders/${orderId}`,
      note: "Paid via PayPal. Funds are released to the shop via PayPal Payouts.",
    });
    expect(second.orderId).toBe(orderId);
    expect(fixture.counts()).toMatchObject({ createCount: 1, payoutCount: 1, completedCount: 1, failCount: 0 });
    expect(fixture.order()?.status).toBe("completed");
  });

  it("falls back to a human approval link above the step-up threshold", async () => {
    const fixture = dependencies({ quote: quote(4_500) });
    const result = await checkoutWithAgentPass({ quoteId, agentClient: "checkout-test", passId }, fixture.deps);
    expect(result).toMatchObject({
      status: "APPROVAL_REQUIRED",
      approveUrl: "https://paypal.test/approve",
      note: "This order is above your Agent Pass step-up limit, so your human needs to approve it.",
    });
    expect(fixture.counts()).toMatchObject({ createCount: 0, payoutCount: 0, approvalCount: 1, bindCount: 1 });
  });

  it("rejects mandate violations before reserving stock or calling PayPal", async () => {
    const denied = dependencies({ pass: passFixture({ categories: ["textiles"] }) });
    await expect(checkoutWithAgentPass({ quoteId, agentClient: "checkout-test", passId }, denied.deps))
      .rejects.toBeInstanceOf(PassUseError);
    const overLimit = dependencies({ pass: passFixture({ perOrderMaxCents: 2_000 }) });
    await expect(checkoutWithAgentPass({ quoteId, agentClient: "checkout-test", passId }, overLimit.deps))
      .rejects.toMatchObject({ code: "PER_ORDER_LIMIT" });
    const revoked = dependencies({ pass: passFixture({ status: "revoked", revokedAt: new Date() }) });
    await expect(checkoutWithAgentPass({ quoteId, agentClient: "checkout-test", passId }, revoked.deps))
      .rejects.toMatchObject({ code: "INVALID" });
    expect(denied.counts().createCount + overLimit.counts().createCount + revoked.counts().createCount).toBe(0);
  });

  it("releases the reservation when a Vault order fails before capture", async () => {
    const fixture = dependencies({ createFails: true });
    await expect(checkoutWithAgentPass({ quoteId, agentClient: "checkout-test", passId }, fixture.deps))
      .rejects.toThrow("mock vault request failed");
    expect(fixture.counts()).toMatchObject({ createCount: 1, payoutCount: 0, failCount: 1, completedCount: 0 });
  });

  it("keeps the order completed and exposes a retryable payout failure", async () => {
    const fixture = dependencies({ payoutFails: true });
    const result = await checkoutWithAgentPass({ quoteId, agentClient: "checkout-test", passId }, fixture.deps);
    expect(result).toMatchObject({ status: "COMPLETED", payoutStatus: "FAILED" });
    expect(fixture.order()).toMatchObject({ status: "completed", payoutStatus: "FAILED" });
    expect(fixture.counts()).toMatchObject({ createCount: 1, payoutCount: 1, failCount: 0, completedCount: 1 });
  });
});
