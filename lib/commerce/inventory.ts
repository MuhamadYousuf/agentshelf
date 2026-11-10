import "server-only";

import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { events, orders, products, type OrderShipping } from "@/lib/db/schema";

export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

export function canReserve(stock: number, reserved: number, quantity: number): boolean {
  return Number.isInteger(quantity) && quantity > 0 && stock - reserved >= quantity;
}

export async function reserve(productId: string, quantity: number): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 1) throw new InventoryError("Reservation quantity must be positive.");
  const [reserved] = await getDb().update(products).set({
    reserved: sql`${products.reserved} + ${quantity}`,
    updatedAt: new Date(),
  }).where(and(
    eq(products.id, productId),
    sql`${products.stock} - ${products.reserved} >= ${quantity}`,
  )).returning({ id: products.id });
  if (!reserved) throw new InventoryError("This item just sold out. Choose another listing.");
}

export async function commit(productId: string, quantity: number): Promise<void> {
  const [updated] = await getDb().update(products).set({
    stock: sql`${products.stock} - ${quantity}`,
    reserved: sql`${products.reserved} - ${quantity}`,
    updatedAt: new Date(),
  }).where(and(
    eq(products.id, productId),
    sql`${products.stock} >= ${quantity}`,
    sql`${products.reserved} >= ${quantity}`,
  )).returning({ id: products.id });
  if (!updated) throw new InventoryError("The stock reservation could not be committed.");
}

export async function release(productId: string, quantity: number): Promise<void> {
  if (!Number.isInteger(quantity) || quantity < 1) return;
  await getDb().update(products).set({
    reserved: sql`GREATEST(0, ${products.reserved} - ${quantity})`,
    updatedAt: new Date(),
  }).where(eq(products.id, productId));
}

export async function completeOrderOnce(input: {
  orderId: string;
  captureId: string;
  paypalFeeCents: number;
  netCents: number;
  buyerEmail: string | null;
  shipping: OrderShipping | null;
}): Promise<boolean> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [order] = await tx.update(orders).set({
      status: "completed",
      captureId: input.captureId,
      paypalFeeCents: input.paypalFeeCents,
      netCents: input.netCents,
      buyerEmail: input.buyerEmail,
      shipping: input.shipping,
      updatedAt: new Date(),
    }).where(and(
      eq(orders.id, input.orderId),
      inArray(orders.status, ["approval_required", "approved"]),
    )).returning({ merchantId: orders.merchantId, productId: orders.productId, qty: orders.qty });
    if (!order) return false;

    const [stock] = await tx.update(products).set({
      stock: sql`${products.stock} - ${order.qty}`,
      reserved: sql`GREATEST(0, ${products.reserved} - ${order.qty})`,
      updatedAt: new Date(),
    }).where(and(
      eq(products.id, order.productId),
      sql`${products.stock} >= ${order.qty}`,
      sql`${products.reserved} >= ${order.qty}`,
    )).returning({ id: products.id });
    if (!stock) throw new InventoryError("The captured order has no remaining stock to commit.");

    await tx.insert(events).values({
      merchantId: order.merchantId,
      type: "payment.captured",
      source: "system",
      payload: {
        orderId: input.orderId,
        captureId: input.captureId,
        feeCents: input.paypalFeeCents,
        netCents: input.netCents,
      },
    });
    return true;
  });
}

export async function failOrderAndRelease(input: {
  orderId: string;
  reason: "cancelled" | "expired" | "failed";
}): Promise<boolean> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [order] = await tx.update(orders).set({
      status: "failed",
      buyerNote: input.reason,
      updatedAt: new Date(),
    }).where(and(
      eq(orders.id, input.orderId),
      inArray(orders.status, ["created", "approval_required"]),
    )).returning({ merchantId: orders.merchantId, productId: orders.productId, qty: orders.qty });
    if (!order) return false;

    await tx.update(products).set({
      reserved: sql`GREATEST(0, ${products.reserved} - ${order.qty})`,
      updatedAt: new Date(),
    }).where(eq(products.id, order.productId));
    await tx.insert(events).values({
      merchantId: order.merchantId,
      type: "checkout.failed",
      source: "system",
      payload: { orderId: input.orderId, reason: input.reason },
    });
    return true;
  });
}

export async function expireStaleReservations(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 60_000);
  const db = getDb();
  return db.transaction(async (tx) => {
    const stale = await tx.select({ id: orders.id }).from(orders).where(and(
      inArray(orders.status, ["created", "approval_required"]),
      lt(orders.createdAt, cutoff),
    ));
    let expired = 0;
    for (const { id } of stale) {
      const [order] = await tx.update(orders).set({
        status: "failed",
        buyerNote: "expired",
        updatedAt: new Date(),
      }).where(and(eq(orders.id, id), inArray(orders.status, ["created", "approval_required"])))
        .returning({ merchantId: orders.merchantId, productId: orders.productId, qty: orders.qty });
      if (!order) continue;
      await tx.update(products).set({
        reserved: sql`GREATEST(0, ${products.reserved} - ${order.qty})`,
        updatedAt: new Date(),
      }).where(eq(products.id, order.productId));
      await tx.insert(events).values({
        merchantId: order.merchantId,
        type: "checkout.failed",
        source: "system",
        payload: { orderId: id, reason: "expired" },
      });
      expired += 1;
    }
    return expired;
  });
}
