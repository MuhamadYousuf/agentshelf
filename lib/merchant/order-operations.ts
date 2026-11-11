import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { events, orders, products, type OrderTracking } from "@/lib/db/schema";
import { executePaypalToolkitAction } from "@/lib/paypal/agent-toolkit";
import { ToolkitResultError } from "@/lib/agents/toolkit-bridge";
import { type OrderTrackingCarrier, makeTrackingUrl, mapCreateShipmentTrackingArgs, safeCopilotText, stablePayPalRequestId } from "./order-operations-core";

export type OwnedOrderForAction = {
  id: string;
  merchantId: string;
  flow: "approval_link" | "agent_pass";
  status: string;
  captureId: string | null;
  paypalOrderId: string | null;
  amountCents: number;
  productTitle: string;
  agentClient: string;
  payoutStatus: string | null;
  tracking: OrderTracking | null;
  isDemo: boolean;
};

export type OrderOperationDependencies = {
  loadOwnedOrder(merchantId: string, orderId: string): Promise<OwnedOrderForAction | undefined>;
  executeToolkit(action: "create_shipment_tracking" | "create_refund", args: Record<string, unknown>, requestId: string): Promise<unknown>;
  saveTracking(merchantId: string, orderId: string, tracking: OrderTracking, paypalSynced: boolean, debugId?: string): Promise<void>;
  markRefunded(merchantId: string, orderId: string, reason: string): Promise<boolean>;
  recordRefundFailure(merchantId: string, orderId: string, debugId?: string): Promise<void>;
  warnPaypalFailure(action: string, debugId?: string): void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function paypalToolkitDebugId(error: unknown): string | undefined {
  if (error instanceof ToolkitResultError) return error.debugId;
  if (!isRecord(error) || !isRecord(error.response)) return undefined;
  const headers = error.response.headers;
  if (!isRecord(headers)) return undefined;
  const header = headers["paypal-debug-id"] ?? headers["Paypal-Debug-Id"];
  if (typeof header === "string") return header;
  const getHeader = headers.get;
  if (typeof getHeader === "function") {
    const value: unknown = getHeader.call(headers, "paypal-debug-id");
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

const databaseDependencies: OrderOperationDependencies = {
  async loadOwnedOrder(merchantId, orderId) {
    const [row] = await getDb().select({
      id: orders.id,
      merchantId: orders.merchantId,
      flow: orders.flow,
      status: orders.status,
      captureId: orders.captureId,
      paypalOrderId: orders.paypalOrderId,
      amountCents: orders.amountCents,
      productTitle: products.title,
      agentClient: orders.agentClient,
      payoutStatus: orders.payoutStatus,
      tracking: orders.tracking,
      isDemo: orders.isDemo,
    }).from(orders)
      .innerJoin(products, eq(orders.productId, products.id))
      .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId), eq(products.merchantId, merchantId)))
      .limit(1);
    if (!row) return undefined;
    return row;
  },
  executeToolkit: (action, args, requestId) => executePaypalToolkitAction(action, args, { requestId }),
  async saveTracking(merchantId, orderId, tracking, paypalSynced, debugId) {
    const [saved] = await getDb().update(orders).set({ tracking, updatedAt: new Date() }).where(and(
      eq(orders.id, orderId),
      eq(orders.merchantId, merchantId),
      eq(orders.status, "completed"),
    )).returning({ id: orders.id });
    if (!saved) throw new Error("That completed order is no longer available.");
    await getDb().insert(events).values({
      merchantId,
      type: "order.tracking_added",
      source: "merchant",
      payload: { orderId, carrier: tracking.carrier, paypalSynced },
    });
    if (!paypalSynced) {
      await getDb().insert(events).values({
        merchantId,
        type: "order.tracking_sync_failed",
        source: "merchant",
        payload: { orderId, ...(debugId ? { debugId } : {}) },
      });
    }
  },
  async markRefunded(merchantId, orderId, reason) {
    const [updated] = await getDb().update(orders).set({ status: "refunded", updatedAt: new Date() }).where(and(
      eq(orders.id, orderId),
      eq(orders.merchantId, merchantId),
      eq(orders.flow, "agent_pass"),
      eq(orders.status, "completed"),
    )).returning({ id: orders.id });
    if (!updated) return false;
    await getDb().insert(events).values({
      merchantId,
      type: "order.refunded",
      source: "merchant",
      payload: { orderId, reason: safeCopilotText(reason, 160) },
    });
    return true;
  },
  async recordRefundFailure(merchantId, orderId, debugId) {
    await getDb().insert(events).values({
      merchantId,
      type: "order.refund_failed",
      source: "merchant",
      payload: { orderId, ...(debugId ? { debugId } : {}) },
    });
  },
  warnPaypalFailure(action, debugId) {
    console.warn("PayPal Agent Toolkit action failed", { action, ...(debugId ? { debugId } : {}) });
  },
};

export class MerchantOrderActionError extends Error {
  constructor(readonly code: "NOT_FOUND" | "NOT_COMPLETED" | "FLOW_NOT_REFUNDABLE" | "ALREADY_REFUNDED" | "MISSING_CAPTURE" | "INVALID_TRACKING" | "DEMO_HISTORY") {
    super(orderActionMessages[code]);
    this.name = "MerchantOrderActionError";
  }
}

const orderActionMessages = {
  NOT_FOUND: "That order could not be found in your shop.",
  NOT_COMPLETED: "Tracking and refunds are available after PayPal completes the payment.",
  FLOW_NOT_REFUNDABLE: "Only Agent Pass orders can be refunded from AgentShelf.",
  ALREADY_REFUNDED: "This order has already been refunded.",
  MISSING_CAPTURE: "PayPal has not returned a capture for this order yet.",
  INVALID_TRACKING: "Enter a tracking number with 6–40 letters, numbers, or hyphens.",
  DEMO_HISTORY: "This is seeded demo history; PayPal actions work on live orders.",
} as const;

export async function addTrackingForMerchant(input: {
  merchantId: string;
  orderId: string;
  carrier: OrderTrackingCarrier;
  trackingNumber: string;
}, dependencies: OrderOperationDependencies = databaseDependencies): Promise<{ message: string; paypalSynced: boolean }> {
  const trackingNumber = input.trackingNumber.trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,40}$/.test(trackingNumber)) throw new MerchantOrderActionError("INVALID_TRACKING");
  const row = await dependencies.loadOwnedOrder(input.merchantId, input.orderId);
  if (!row) throw new MerchantOrderActionError("NOT_FOUND");
  if (row.status !== "completed") throw new MerchantOrderActionError("NOT_COMPLETED");
  const tracking: OrderTracking = {
    carrier: input.carrier,
    trackingNumber,
    ...(makeTrackingUrl(input.carrier, trackingNumber) ? { url: makeTrackingUrl(input.carrier, trackingNumber) } : {}),
  };
  if (row.isDemo) {
    await dependencies.saveTracking(input.merchantId, row.id, tracking, false);
    return { message: orderActionMessages.DEMO_HISTORY, paypalSynced: false };
  }
  if (!row.captureId) throw new MerchantOrderActionError("MISSING_CAPTURE");
  const toolkitArgs = mapCreateShipmentTrackingArgs({
    captureId: row.captureId,
    paypalOrderId: row.paypalOrderId,
    carrier: input.carrier,
    trackingNumber,
  });
  const requestId = stablePayPalRequestId("tracking", `${row.id}:${input.carrier}:${trackingNumber}`);
  let paypalSynced = false;
  let debugId: string | undefined;
  try {
    await dependencies.executeToolkit("create_shipment_tracking", toolkitArgs, requestId);
    paypalSynced = true;
  } catch (error) {
    debugId = paypalToolkitDebugId(error);
    dependencies.warnPaypalFailure("create_shipment_tracking", debugId);
  }
  await dependencies.saveTracking(input.merchantId, row.id, tracking, paypalSynced, debugId);

  if (paypalSynced) return { message: "Tracking was saved on AgentShelf and sent to PayPal.", paypalSynced };
  if (row.flow === "approval_link") {
    return {
      message: "Saved on AgentShelf; PayPal tracking for direct payments must be added from your PayPal account.",
      paypalSynced,
    };
  }
  return { message: "Saved on AgentShelf. PayPal could not confirm tracking; you can retry from this order.", paypalSynced };
}

export type RefundPreview = {
  status: "needs_confirmation";
  orderId: string;
  productTitle: string;
  amountCents: number;
  reason: string;
};

export async function prepareRefundConfirmation(input: {
  merchantId: string;
  orderId: string;
  reason: string;
}, dependencies: Pick<OrderOperationDependencies, "loadOwnedOrder"> = databaseDependencies): Promise<RefundPreview> {
  const row = await dependencies.loadOwnedOrder(input.merchantId, input.orderId);
  if (!row) throw new MerchantOrderActionError("NOT_FOUND");
  if (row.isDemo) throw new MerchantOrderActionError("DEMO_HISTORY");
  if (row.flow !== "agent_pass") throw new MerchantOrderActionError("FLOW_NOT_REFUNDABLE");
  if (row.status === "refunded") throw new MerchantOrderActionError("ALREADY_REFUNDED");
  if (row.status !== "completed") throw new MerchantOrderActionError("NOT_COMPLETED");
  if (!row.captureId) throw new MerchantOrderActionError("MISSING_CAPTURE");
  return {
    status: "needs_confirmation",
    orderId: row.id,
    productTitle: safeCopilotText(row.productTitle, 80),
    amountCents: row.amountCents,
    reason: safeCopilotText(input.reason || "Merchant requested a refund", 160),
  };
}

export async function confirmRefundForMerchant(input: {
  merchantId: string;
  orderId: string;
  reason: string;
}, dependencies: OrderOperationDependencies = databaseDependencies): Promise<{ success: boolean; message: string }> {
  try {
    const row = await dependencies.loadOwnedOrder(input.merchantId, input.orderId);
    if (!row) throw new MerchantOrderActionError("NOT_FOUND");
    if (row.isDemo) throw new MerchantOrderActionError("DEMO_HISTORY");
    if (row.flow !== "agent_pass") throw new MerchantOrderActionError("FLOW_NOT_REFUNDABLE");
    if (row.status === "refunded") throw new MerchantOrderActionError("ALREADY_REFUNDED");
    if (row.status !== "completed") throw new MerchantOrderActionError("NOT_COMPLETED");
    if (!row.captureId) throw new MerchantOrderActionError("MISSING_CAPTURE");

    const reason = safeCopilotText(input.reason || "Merchant requested a refund", 160);
    await dependencies.executeToolkit("create_refund", {
      capture_id: row.captureId,
      note_to_payer: "AgentShelf order refund",
    }, stablePayPalRequestId("refund", row.id));
    const updated = await dependencies.markRefunded(input.merchantId, row.id, reason);
    if (!updated) {
      const current = await dependencies.loadOwnedOrder(input.merchantId, row.id);
      if (current?.status !== "refunded") throw new Error("Refund completed but order status could not be refreshed.");
    }
    return {
      success: true,
      message: "Refunded from AgentShelf escrow. In production the merchant payout is held until the delivery window ends.",
    };
  } catch (error) {
    if (error instanceof MerchantOrderActionError) return { success: false, message: error.message };
    const debugId = paypalToolkitDebugId(error);
    dependencies.warnPaypalFailure("create_refund", debugId);
    await dependencies.recordRefundFailure(input.merchantId, input.orderId, debugId).catch(() => undefined);
    return { success: false, message: "PayPal could not complete this refund. Review the order and try again." };
  }
}
