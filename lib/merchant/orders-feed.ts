import "server-only";

import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { negotiations, orders, products, quotes, type OrderTracking } from "@/lib/db/schema";
import { displayAgentClient, orderRevenueChannel } from "./analytics";

export type MerchantOrderRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  thumbnailUrl: string | null;
  qty: number;
  amountCents: number;
  refundedCents?: number;
  listPriceCents: number;
  discountPct: number;
  channel: "agent" | "storefront";
  agentClient: string;
  flow: "approval_link" | "agent_pass";
  status: string;
  payoutStatus: string | null;
  captureId: string | null;
  tracking: OrderTracking | null;
  negotiationId: string | null;
  rounds: number;
  isDemo: boolean;
  shippingCity: string | null;
  shippingCountry: string | null;
};

export type OrdersFeedOptions = { since?: Date };

export function makeMerchantOrderRow(input: {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  title: string;
  imageId: string | null;
  qty: number;
  amountCents: number;
  listPriceCents: number;
  agentClient: string;
  flow: "approval_link" | "agent_pass";
  status: string;
  payoutStatus: string | null;
  captureId: string | null;
  tracking: OrderTracking | null;
  negotiationId: string | null;
  rounds: number | null;
  isDemo: boolean;
  shipping: { address?: { city?: string; countryCode?: string } } | null;
}): MerchantOrderRow {
  const listTotal = input.listPriceCents * input.qty;
  return {
    id: input.id,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
    title: input.title,
    thumbnailUrl: input.imageId ? `/api/images/${input.imageId}` : null,
    qty: input.qty,
    amountCents: input.amountCents,
    listPriceCents: input.listPriceCents,
    discountPct: listTotal > 0 ? Math.max(0, ((listTotal - input.amountCents) / listTotal) * 100) : 0,
    channel: orderRevenueChannel(input.flow, input.agentClient),
    agentClient: input.agentClient === "storefront" ? "Storefront" : displayAgentClient(input.agentClient),
    flow: input.flow,
    status: input.status,
    payoutStatus: input.payoutStatus,
    captureId: input.captureId,
    tracking: input.tracking,
    negotiationId: input.negotiationId,
    rounds: input.rounds ?? 0,
    isDemo: input.isDemo,
    shippingCity: input.shipping?.address?.city ?? null,
    shippingCountry: input.shipping?.address?.countryCode ?? null,
  };
}

export async function listMerchantOrders(
  merchantId: string,
  options: OrdersFeedOptions = {},
): Promise<MerchantOrderRow[]> {
  const rows = await getDb().select({
    id: orders.id,
    createdAt: orders.createdAt,
    updatedAt: orders.updatedAt,
    title: products.title,
    images: products.images,
    qty: orders.qty,
    amountCents: orders.amountCents,
    listPriceCents: products.listPriceCents,
    agentClient: orders.agentClient,
    flow: orders.flow,
    status: orders.status,
    payoutStatus: orders.payoutStatus,
    captureId: orders.captureId,
    tracking: orders.tracking,
    negotiationId: quotes.negotiationId,
    rounds: negotiations.round,
    isDemo: orders.isDemo,
    shipping: orders.shipping,
  }).from(orders)
    .innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(quotes, eq(orders.quoteId, quotes.id))
    .leftJoin(negotiations, eq(quotes.negotiationId, negotiations.id))
    .where(and(
      eq(orders.merchantId, merchantId),
      ...(options.since ? [gt(orders.updatedAt, options.since)] : []),
    ))
    .orderBy(desc(orders.createdAt));

  return rows.map((row) => makeMerchantOrderRow({
    ...row,
    imageId: row.images[0]?.id ?? null,
  }));
}
