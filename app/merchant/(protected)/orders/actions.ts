"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMerchant } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { events, merchants, orders, products } from "@/lib/db/schema";
import { PayPalError } from "@/lib/paypal/client";
import { createPayout } from "@/lib/paypal/payouts";
import { addTrackingForMerchant, confirmRefundForMerchant, MerchantOrderActionError } from "@/lib/merchant/order-operations";
import { orderTrackingCarriers, type OrderTrackingCarrier } from "@/lib/merchant/order-operations-core";

const orderIdSchema = z.uuid();
const trackingActionSchema = z.object({
  orderId: z.uuid(),
  carrier: z.enum(orderTrackingCarriers),
  trackingNumber: z.string().regex(/^[A-Z0-9-]{6,40}$/),
}).strict();
const refundActionSchema = z.object({ orderId: z.uuid(), reason: z.string().trim().min(1).max(240) }).strict();

export async function saveOrderTrackingAction(input: {
  orderId: string;
  carrier: OrderTrackingCarrier;
  trackingNumber: string;
}): Promise<{ success: boolean; message: string; paypalSynced?: boolean }> {
  const parsed = trackingActionSchema.safeParse({
    ...input,
    trackingNumber: input.trackingNumber.trim().toUpperCase(),
  });
  if (!parsed.success) return { success: false, message: "Enter a valid carrier and tracking number." };
  const merchant = await requireMerchant();
  try {
    const result = await addTrackingForMerchant({
      merchantId: merchant.id,
      orderId: parsed.data.orderId,
      carrier: parsed.data.carrier,
      trackingNumber: parsed.data.trackingNumber,
    });
    revalidatePath("/merchant/orders");
    revalidatePath("/merchant");
    return { success: true, ...result };
  } catch (error) {
    return {
      success: false,
      message: error instanceof MerchantOrderActionError ? error.message : "Tracking could not be saved. Try again.",
    };
  }
}

export async function confirmOrderRefundAction(input: {
  orderId: string;
  reason: string;
}): Promise<{ success: boolean; message: string }> {
  const parsed = refundActionSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "This refund request is not valid." };
  const merchant = await requireMerchant();
  const result = await confirmRefundForMerchant({
    merchantId: merchant.id,
    orderId: parsed.data.orderId,
    reason: parsed.data.reason,
  });
  if (result.success) {
    revalidatePath("/merchant/orders");
    revalidatePath("/merchant");
  }
  return result;
}

export async function retryMerchantPayout(formData: FormData): Promise<void> {
  const parsed = orderIdSchema.safeParse(formData.get("orderId"));
  if (!parsed.success) return;
  const merchant = await requireMerchant();
  const db = getDb();
  const [row] = await db.select({
    id: orders.id,
    amountCents: orders.netCents,
    payoutStatus: orders.payoutStatus,
    flow: orders.flow,
    status: orders.status,
    productTitle: products.title,
    paypalEmail: merchants.paypalEmail,
  }).from(orders).innerJoin(merchants, eq(orders.merchantId, merchants.id))
    .innerJoin(products, eq(orders.productId, products.id))
    .where(and(
      eq(orders.id, parsed.data),
      eq(orders.merchantId, merchant.id),
      eq(orders.flow, "agent_pass"),
      eq(orders.status, "completed"),
      eq(orders.payoutStatus, "FAILED"),
    )).limit(1);
  if (!row || !row.amountCents || row.amountCents < 1) return;

  try {
    const payout = await createPayout({
      requestId: `payout-${row.id}`,
      receiverEmail: row.paypalEmail,
      amountCents: row.amountCents,
      note: `AgentShelf agent sale: ${row.productTitle}`,
    });
    const batchId = payout.batch_header?.payout_batch_id;
    const payoutStatus = payout.batch_header?.batch_status;
    if (!batchId || !payoutStatus) throw new Error("Payout response was incomplete.");
    await db.update(orders).set({ payoutBatchId: batchId, payoutStatus, updatedAt: new Date() })
      .where(and(eq(orders.id, row.id), eq(orders.merchantId, merchant.id), eq(orders.payoutStatus, "FAILED")));
    await db.insert(events).values({
      merchantId: merchant.id,
      type: "payout.retry_sent",
      source: "merchant",
      payload: { orderId: row.id, payoutBatchId: batchId, payoutStatus },
    });
  } catch (error) {
    await db.update(orders).set({ payoutStatus: "FAILED", updatedAt: new Date() })
      .where(and(eq(orders.id, row.id), eq(orders.merchantId, merchant.id)));
    await db.insert(events).values({
      merchantId: merchant.id,
      type: "payout.retry_failed",
      source: "merchant",
      payload: { orderId: row.id, ...(error instanceof PayPalError && error.debugId ? { debugId: error.debugId } : {}) },
    }).catch(() => undefined);
  }
  revalidatePath("/merchant/orders");
}
