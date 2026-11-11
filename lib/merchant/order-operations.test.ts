import { describe, expect, it, vi } from "vitest";
import {
  addTrackingForMerchant,
  confirmRefundForMerchant,
  MerchantOrderActionError,
  prepareRefundConfirmation,
  type OrderOperationDependencies,
  type OwnedOrderForAction,
} from "./order-operations";
import { isValidTrackingNumber, mapCreateShipmentTrackingArgs, makeTrackingUrl } from "./order-operations-core";

function order(overrides: Partial<OwnedOrderForAction> = {}): OwnedOrderForAction {
  return {
    id: "order-1",
    merchantId: "merchant-1",
    flow: "agent_pass",
    status: "completed",
    captureId: "capture-1",
    paypalOrderId: "paypal-order-1",
    amountCents: 2_380,
    productTitle: "Speckled Mug",
    agentClient: "AgentShelf Shopper",
    payoutStatus: "SUCCESS",
    tracking: null,
    isDemo: false,
    ...overrides,
  };
}

function dependencies(row = order()): OrderOperationDependencies {
  return {
    loadOwnedOrder: vi.fn(async (merchantId: string, orderId: string) => orderId === row.id && merchantId === row.merchantId ? row : undefined),
    executeToolkit: vi.fn(async () => ({ status: "SUCCESS" })),
    saveTracking: vi.fn(async () => undefined),
    markRefunded: vi.fn(async () => true),
    recordRefundFailure: vi.fn(async () => undefined),
    warnPaypalFailure: vi.fn(),
  };
}

describe("merchant order operations", () => {
  it("maps tracking data to the toolkit's capture transaction shape", () => {
    expect(mapCreateShipmentTrackingArgs({
      captureId: "capture-1",
      paypalOrderId: "paypal-order-1",
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
    })).toEqual({
      order_id: "paypal-order-1",
      transaction_id: "capture-1",
      tracking_number: "1Z999AA10123456784",
      carrier: "UPS",
      status: "SHIPPED",
    });
  });

  it("validates the requested tracking-number pattern", () => {
    expect(isValidTrackingNumber("1Z999AA10123456784")).toBe(true);
    expect(isValidTrackingNumber("abc-123")).toBe(false);
    expect(isValidTrackingNumber("12345")).toBe(false);
    expect(isValidTrackingNumber("A".repeat(41))).toBe(false);
    expect(makeTrackingUrl("UPS", "1Z999AA10123456784")).toContain("1Z999AA10123456784");
  });

  it("saves Flow A tracking locally and reports the PayPal fallback on toolkit refusal", async () => {
    const deps = dependencies(order({ flow: "approval_link" }));
    vi.mocked(deps.executeToolkit).mockRejectedValue(new Error("permission denied"));
    const result = await addTrackingForMerchant({
      merchantId: "merchant-1",
      orderId: "order-1",
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
    }, deps);

    expect(deps.executeToolkit).toHaveBeenCalledOnce();
    expect(deps.saveTracking).toHaveBeenCalledWith("merchant-1", "order-1", expect.objectContaining({
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
    }), false, undefined);
    expect(result.message).toBe("Saved on AgentShelf; PayPal tracking for direct payments must be added from your PayPal account.");
  });

  it("does not call PayPal for demo tracking and returns the seeded-history notice", async () => {
    const deps = dependencies(order({ isDemo: true, captureId: null, paypalOrderId: null }));
    const result = await addTrackingForMerchant({
      merchantId: "merchant-1",
      orderId: "order-1",
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
    }, deps);
    expect(result.message).toBe("This is seeded demo history; PayPal actions work on live orders.");
    expect(result.paypalSynced).toBe(false);
    expect(deps.executeToolkit).not.toHaveBeenCalled();
    expect(deps.saveTracking).toHaveBeenCalledOnce();
  });

  it("prepares a Flow B refund confirmation without executing a refund", async () => {
    const deps = dependencies();
    const preview = await prepareRefundConfirmation({
      merchantId: "merchant-1",
      orderId: "order-1",
      reason: "buyer request",
    }, deps);
    expect(preview).toMatchObject({ status: "needs_confirmation", orderId: "order-1", amountCents: 2_380 });
    expect(deps.executeToolkit).not.toHaveBeenCalled();
  });

  it.each([
    order({ flow: "approval_link" }),
    order({ status: "refunded" }),
    order({ status: "approval_required" }),
  ])("refuses a refund preview for an ineligible order", async (row) => {
    const deps = dependencies(row);
    await expect(prepareRefundConfirmation({ merchantId: "merchant-1", orderId: row.id, reason: "test" }, deps))
      .rejects.toBeInstanceOf(MerchantOrderActionError);
    expect(deps.executeToolkit).not.toHaveBeenCalled();
  });

  it("refuses confirmation for Flow A, refunded, and non-completed orders before toolkit calls", async () => {
    const ineligibleOrders = [
      order({ flow: "approval_link" }),
      order({ status: "refunded" }),
      order({ status: "approval_required" }),
      order({ isDemo: true }),
    ];
    for (const row of ineligibleOrders) {
      const deps = dependencies(row);
      const result = await confirmRefundForMerchant({ merchantId: "merchant-1", orderId: row.id, reason: "test" }, deps);
      expect(result.success).toBe(false);
      expect(deps.executeToolkit).not.toHaveBeenCalled();
    }
  });

  it("returns a friendly ownership error without calling the toolkit", async () => {
    const deps = dependencies();
    const result = await confirmRefundForMerchant({ merchantId: "merchant-2", orderId: "order-1", reason: "test" }, deps);
    expect(result.success).toBe(false);
    expect(result.message).toContain("could not be found");
    expect(deps.executeToolkit).not.toHaveBeenCalled();
  });
});
