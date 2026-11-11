import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { negotiations, orders, products, quotes } from "@/lib/db/schema";

export async function getMerchantOrderDetail(merchantId: string, orderId: string) {
  const [row] = await getDb().select({
    id: orders.id,
    createdAt: orders.createdAt,
    updatedAt: orders.updatedAt,
    qty: orders.qty,
    amountCents: orders.amountCents,
    flow: orders.flow,
    agentClient: orders.agentClient,
    status: orders.status,
    isDemo: orders.isDemo,
    captureId: orders.captureId,
    paypalOrderId: orders.paypalOrderId,
    payoutBatchId: orders.payoutBatchId,
    payoutStatus: orders.payoutStatus,
    tracking: orders.tracking,
    shipping: orders.shipping,
    productId: products.id,
    productTitle: products.title,
    listPriceCents: products.listPriceCents,
    images: products.images,
    negotiationId: negotiations.id,
    negotiationClient: negotiations.clientName,
    messages: negotiations.messages,
    trace: negotiations.trace,
    round: negotiations.round,
  }).from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(quotes, eq(orders.quoteId, quotes.id))
    .leftJoin(negotiations, eq(quotes.negotiationId, negotiations.id))
    .where(and(
      eq(orders.id, orderId),
      eq(orders.merchantId, merchantId),
      eq(products.merchantId, merchantId),
    ))
    .limit(1);
  if (!row) return undefined;
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    qty: row.qty,
    amountCents: row.amountCents,
    flow: row.flow,
    agentClient: row.agentClient,
    status: row.status,
    isDemo: row.isDemo,
    captureId: row.captureId,
    paypalOrderId: row.paypalOrderId,
    payoutBatchId: row.payoutBatchId,
    payoutStatus: row.payoutStatus,
    tracking: row.tracking,
    shippingCity: row.shipping?.address.city ?? null,
    shippingCountry: row.shipping?.address.countryCode ?? null,
    product: {
      id: row.productId,
      title: row.productTitle,
      listPriceCents: row.listPriceCents,
      thumbnailUrl: row.images[0]?.id ? `/api/images/${row.images[0].id}` : null,
    },
    negotiation: row.negotiationId ? {
      id: row.negotiationId,
      clientName: row.negotiationClient ?? row.agentClient,
      round: row.round ?? 0,
      messages: row.messages ?? [],
      trace: row.trace ?? [],
    } : null,
  };
}
