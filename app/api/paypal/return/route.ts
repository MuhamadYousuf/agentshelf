import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { completeOrderOnce, expireStaleReservations, failOrderAndRelease } from "@/lib/commerce/inventory";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { captureOrder } from "@/lib/paypal/orders";

const orderIdSchema = z.uuid();

export async function GET(request: Request): Promise<Response> {
  await expireStaleReservations();
  const url = new URL(request.url);
  const orderId = url.searchParams.get("order");
  const paypalToken = url.searchParams.get("token");
  if (!orderId || !orderIdSchema.safeParse(orderId).success || !paypalToken) {
    return new Response("Order not found.", { status: 404 });
  }

  const [order] = await getDb().select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || !order.paypalOrderId || paypalToken !== order.paypalOrderId) {
    return new Response("Order not found.", { status: 404 });
  }
  if (order.status === "approval_required" || order.status === "approved") {
    const capture = await captureOrder(order.paypalOrderId, `capture-${order.id}`);
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

  return NextResponse.redirect(new URL(`/orders/${order.id}`, request.url), 303);
}
