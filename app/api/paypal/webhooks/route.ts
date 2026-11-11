import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { completeOrderOnce, expireStaleReservations, failOrderAndRelease } from "@/lib/commerce/inventory";
import { getDb } from "@/lib/db";
import { events, orders } from "@/lib/db/schema";
import { captureOrder, getOrder, parsePayPalCapture, type PayPalOrderResponse } from "@/lib/paypal/orders";
import { PayPalWebhookConfigurationError, verifyWebhook } from "@/lib/paypal/webhooks";
import { getPaypalConfiguration } from "@/lib/env";
import { getMcpClientIp } from "@/lib/mcp/request-context";
import { consumeFixedWindowLimit } from "@/lib/security/ratelimit";

export const maxDuration = 60;

let warnedMissingWebhookId = false;

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function paypalOrderIdFromEvent(event: Record<string, unknown>): string | undefined {
  const resource = objectValue(event.resource);
  if (!resource) return undefined;
  const eventType = typeof event.event_type === "string" ? event.event_type : "";
  if (eventType === "CHECKOUT.ORDER.APPROVED" && typeof resource.id === "string") return resource.id;
  const supplementary = objectValue(resource.supplementary_data);
  const related = objectValue(supplementary?.related_ids);
  return typeof related?.order_id === "string" ? related.order_id : undefined;
}

async function orderByPaypalId(paypalOrderId: string) {
  const [order] = await getDb().select().from(orders).where(eq(orders.paypalOrderId, paypalOrderId)).limit(1);
  return order;
}

async function applyCompletedCapture(orderId: string, paypalOrder: PayPalOrderResponse): Promise<boolean> {
  const capture = parsePayPalCapture(paypalOrder);
  if (capture.status !== "COMPLETED") return false;
  await completeOrderOnce({
    orderId,
    captureId: capture.captureId,
    paypalFeeCents: capture.feeCents,
    netCents: capture.netCents,
    buyerEmail: capture.payerEmail,
    shipping: capture.shipping,
  });
  return true;
}

async function markRefunded(orderId: string, captureId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(orders).set({ status: "refunded", updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, "completed")))
      .returning({ merchantId: orders.merchantId });
    if (!updated) return;
    await tx.insert(events).values({
      merchantId: updated.merchantId,
      type: "payment.refunded",
      source: "webhook",
      payload: { orderId, captureId },
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!getPaypalConfiguration().webhookId) {
    if (!warnedMissingWebhookId) {
      console.warn("PayPal webhook is not configured; webhook requests are disabled.");
      warnedMissingWebhookId = true;
    }
    return NextResponse.json({ error: "Webhook verification is not configured." }, { status: 503 });
  }

  let rateLimit: Awaited<ReturnType<typeof consumeFixedWindowLimit>>;
  try {
    rateLimit = await consumeFixedWindowLimit({
      key: `paypal:webhook:${getMcpClientIp(request)}`,
      limit: 120,
      windowMs: 60_000,
    });
  } catch {
    return NextResponse.json({ error: "Webhook verification is temporarily unavailable." }, { status: 503 });
  }
  if (!rateLimit.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rateLimit.resetsAt.getTime() - Date.now()) / 1_000));
    return NextResponse.json({ error: "Too many webhook requests. Try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    });
  }

  await expireStaleReservations();
  const rawBody = await request.text();
  let event: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    const object = objectValue(parsed);
    if (!object) return NextResponse.json({ error: "Invalid webhook event." }, { status: 400 });
    event = object;
  } catch {
    return NextResponse.json({ error: "Invalid webhook event." }, { status: 400 });
  }

  try {
    if (!(await verifyWebhook(request.headers, rawBody))) {
      return NextResponse.json({ error: "Webhook signature verification failed." }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof PayPalWebhookConfigurationError) {
      return NextResponse.json({ error: "Webhook verification is not configured." }, { status: 503 });
    }
    throw error;
  }

  const eventId = typeof event.id === "string" ? event.id : undefined;
  const eventType = typeof event.event_type === "string" ? event.event_type : undefined;
  if (!eventId || !eventType) return NextResponse.json({ error: "Webhook event is missing its ID or type." }, { status: 400 });

  const [accepted] = await getDb().insert(events).values({
    type: `paypal.webhook.${eventType.toLowerCase()}`,
    source: "webhook",
    payload: { eventType },
    externalId: eventId,
  }).onConflictDoNothing({ target: events.externalId }).returning({ id: events.id });
  if (!accepted) return NextResponse.json({ received: true, duplicate: true });

  try {
    const paypalOrderId = paypalOrderIdFromEvent(event);
    if (!paypalOrderId) return NextResponse.json({ received: true });
    const order = await orderByPaypalId(paypalOrderId);
    if (!order) return NextResponse.json({ received: true });

    if (eventType === "CHECKOUT.ORDER.APPROVED") {
      if (order.status === "approval_required" || order.status === "approved") {
        const current = await getOrder(paypalOrderId);
        const alreadyHasCapture = current.purchase_units?.some((purchaseUnit) => {
          const payments = objectValue(objectValue(purchaseUnit)?.payments);
          return Array.isArray(payments?.captures) && payments.captures.length > 0;
        }) ?? false;
        if (alreadyHasCapture) {
          const currentCapture = parsePayPalCapture(current);
          if (currentCapture.status === "COMPLETED") await applyCompletedCapture(order.id, current);
          else if (currentCapture.status === "DENIED") await failOrderAndRelease({ orderId: order.id, reason: "failed" });
        } else {
          const capture = await captureOrder(paypalOrderId, `capture-${order.id}`);
          if (capture.status === "COMPLETED") {
            await completeOrderOnce({
              orderId: order.id,
              captureId: capture.captureId,
              paypalFeeCents: capture.feeCents,
              netCents: capture.netCents,
              buyerEmail: capture.payerEmail,
              shipping: capture.shipping,
            });
          } else if (capture.status === "DENIED") {
            await failOrderAndRelease({ orderId: order.id, reason: "failed" });
          }
        }
      }
    } else if (eventType.startsWith("PAYMENT.CAPTURE.")) {
      const current = await getOrder(paypalOrderId);
      const capture = parsePayPalCapture(current);
      const eventCaptureId = objectValue(event.resource)?.id;
      if (eventType === "PAYMENT.CAPTURE.COMPLETED" && capture.status === "COMPLETED" && eventCaptureId === capture.captureId) {
        await applyCompletedCapture(order.id, current);
      } else if (eventType === "PAYMENT.CAPTURE.DENIED" && capture.status === "DENIED" && eventCaptureId === capture.captureId) {
        await failOrderAndRelease({ orderId: order.id, reason: "failed" });
      } else if (
        eventType === "PAYMENT.CAPTURE.REFUNDED" &&
        (capture.status === "REFUNDED" || capture.status === "COMPLETED") &&
        eventCaptureId === capture.captureId
      ) {
        await markRefunded(order.id, capture.captureId);
      }
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    await getDb().delete(events).where(eq(events.externalId, eventId));
    throw error;
  }
}
