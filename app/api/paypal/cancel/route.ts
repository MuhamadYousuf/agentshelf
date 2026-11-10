import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { failOrderAndRelease, expireStaleReservations } from "@/lib/commerce/inventory";
import { getDb } from "@/lib/db";
import { merchants, orders } from "@/lib/db/schema";

export async function GET(request: Request): Promise<Response> {
  await expireStaleReservations();
  const url = new URL(request.url);
  const orderId = url.searchParams.get("order");
  if (!orderId) return new Response("Order not found.", { status: 404 });

  const [order] = await getDb().select({ id: orders.id, merchantId: orders.merchantId, productId: orders.productId })
    .from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return new Response("Order not found.", { status: 404 });
  await failOrderAndRelease({ orderId, reason: "cancelled" });

  const [shop] = await getDb().select({ slug: merchants.slug }).from(merchants)
    .where(eq(merchants.id, order.merchantId)).limit(1);
  if (!shop) return new Response("Shop not found.", { status: 404 });
  return NextResponse.redirect(new URL(`/s/${shop.slug}/p/${order.productId}?checkout=cancelled`, request.url), 303);
}
