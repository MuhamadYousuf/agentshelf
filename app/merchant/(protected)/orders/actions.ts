"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMerchant } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { events, merchants, orders, products } from "@/lib/db/schema";
import { PayPalError } from "@/lib/paypal/client";
import { createPayout } from "@/lib/paypal/payouts";

const orderIdSchema = z.uuid();

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
