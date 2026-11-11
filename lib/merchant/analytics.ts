import "server-only";

import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { negotiations, orders, products, quotes } from "@/lib/db/schema";

export type RevenueChannel = "agent" | "storefront";

export type AnalyticsOrder = {
  id: string;
  createdAt: Date;
  productId: string;
  productTitle: string;
  qty: number;
  amountCents: number;
  listPriceCents: number;
  flow: "approval_link" | "agent_pass";
  agentClient: string;
  status: string;
  payoutStatus: string | null;
  negotiationId: string | null;
};

export type AnalyticsNegotiation = { id: string; createdAt: Date };

export type SalesInsights = {
  from: string;
  to: string;
  totalRevenueCents: number;
  agentRevenueCents: number;
  storefrontRevenueCents: number;
  agentOrderCount: number;
  storefrontOrderCount: number;
  agentSharePct: number;
  averageNegotiatedDiscountPct: number;
  negotiationConversionPct: number;
  negotiationCount: number;
  convertedNegotiationCount: number;
  revenueByDay: Array<{
    day: string;
    agentRevenueCents: number;
    storefrontRevenueCents: number;
  }>;
  revenueByAgentClient: Array<{ client: string; revenueCents: number; orderCount: number }>;
  topProducts: Array<{ productId: string; title: string; revenueCents: number; orderCount: number }>;
};

export function orderRevenueChannel(flow: string, agentClient: string): RevenueChannel {
  if (flow === "agent_pass") return "agent";
  return agentClient.trim().toLowerCase() === "storefront" ? "storefront" : "agent";
}

export function displayAgentClient(agentClient: string): string {
  const normalized = agentClient.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (normalized.includes("claude")) return "Claude Desktop";
  if (normalized.includes("agentshelf shopper")) return "AgentShelf Shopper";
  return "Other MCP clients";
}

export function isPendingPayout(order: Pick<AnalyticsOrder, "flow" | "status" | "payoutStatus">): boolean {
  if (order.flow !== "agent_pass" || order.status !== "completed") return false;
  const terminal = new Set(["SUCCESS", "COMPLETED", "DENIED", "CANCELED", "CANCELLED", "FAILED"]);
  return !order.payoutStatus || !terminal.has(order.payoutStatus.toUpperCase());
}

function inRange(date: Date, from: Date, to: Date): boolean {
  return date.getTime() >= from.getTime() && date.getTime() < to.getTime();
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDays(from: Date, to: Date): string[] {
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const last = new Date(Math.max(from.getTime(), to.getTime() - 1));
  const days: string[] = [];
  while (cursor.getTime() <= last.getTime() && days.length < 366) {
    days.push(utcDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function aggregateSalesInsights(input: {
  orders: AnalyticsOrder[];
  negotiations: AnalyticsNegotiation[];
  from: Date;
  to: Date;
}): SalesInsights {
  const sales = input.orders.filter((order) =>
    order.status === "completed" && inRange(order.createdAt, input.from, input.to),
  );
  const agentSales = sales.filter((order) => orderRevenueChannel(order.flow, order.agentClient) === "agent");
  const storefrontSales = sales.filter((order) => orderRevenueChannel(order.flow, order.agentClient) === "storefront");
  const agentRevenueCents = agentSales.reduce((sum, order) => sum + order.amountCents, 0);
  const storefrontRevenueCents = storefrontSales.reduce((sum, order) => sum + order.amountCents, 0);
  const discounts = agentSales.map((order) => {
    const listTotal = order.listPriceCents * order.qty;
    return listTotal > 0 ? Math.max(0, (listTotal - order.amountCents) / listTotal) * 100 : 0;
  });

  const byDay = new Map<string, { agentRevenueCents: number; storefrontRevenueCents: number }>();
  for (const day of utcDays(input.from, input.to)) {
    byDay.set(day, { agentRevenueCents: 0, storefrontRevenueCents: 0 });
  }
  for (const order of sales) {
    const day = utcDay(order.createdAt);
    const bucket = byDay.get(day);
    if (!bucket) continue;
    if (orderRevenueChannel(order.flow, order.agentClient) === "agent") {
      bucket.agentRevenueCents += order.amountCents;
    } else {
      bucket.storefrontRevenueCents += order.amountCents;
    }
  }

  const clients = new Map<string, { revenueCents: number; orderCount: number }>();
  for (const order of agentSales) {
    const client = displayAgentClient(order.agentClient);
    const bucket = clients.get(client) ?? { revenueCents: 0, orderCount: 0 };
    bucket.revenueCents += order.amountCents;
    bucket.orderCount += 1;
    clients.set(client, bucket);
  }

  const productsByRevenue = new Map<string, { title: string; revenueCents: number; orderCount: number }>();
  for (const order of sales) {
    const bucket = productsByRevenue.get(order.productId) ?? {
      title: order.productTitle,
      revenueCents: 0,
      orderCount: 0,
    };
    bucket.revenueCents += order.amountCents;
    bucket.orderCount += 1;
    productsByRevenue.set(order.productId, bucket);
  }

  const negotiationsInRange = input.negotiations.filter((entry) => inRange(entry.createdAt, input.from, input.to));
  const convertedIds = new Set(
    sales.flatMap((order) => order.negotiationId ? [order.negotiationId] : []),
  );
  const convertedNegotiationCount = negotiationsInRange.filter((entry) => convertedIds.has(entry.id)).length;
  const totalRevenueCents = agentRevenueCents + storefrontRevenueCents;

  return {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    totalRevenueCents,
    agentRevenueCents,
    storefrontRevenueCents,
    agentOrderCount: agentSales.length,
    storefrontOrderCount: storefrontSales.length,
    agentSharePct: totalRevenueCents > 0 ? (agentRevenueCents / totalRevenueCents) * 100 : 0,
    averageNegotiatedDiscountPct: discounts.length > 0
      ? discounts.reduce((sum, discount) => sum + discount, 0) / discounts.length
      : 0,
    negotiationConversionPct: negotiationsInRange.length > 0
      ? (convertedNegotiationCount / negotiationsInRange.length) * 100
      : 0,
    negotiationCount: negotiationsInRange.length,
    convertedNegotiationCount,
    revenueByDay: [...byDay].map(([day, values]) => ({ day, ...values })),
    revenueByAgentClient: [...clients].map(([client, values]) => ({ client, ...values }))
      .sort((a, b) => b.revenueCents - a.revenueCents),
    topProducts: [...productsByRevenue].map(([productId, values]) => ({ productId, ...values }))
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 5),
  };
}

export async function getSalesInsights(
  merchantId: string,
  range: { from: Date; to: Date },
): Promise<SalesInsights> {
  const db = getDb();
  const [orderRows, negotiationRows] = await Promise.all([
    db.select({
      id: orders.id,
      createdAt: orders.createdAt,
      productId: products.id,
      productTitle: products.title,
      qty: orders.qty,
      amountCents: orders.amountCents,
      listPriceCents: products.listPriceCents,
      flow: orders.flow,
      agentClient: orders.agentClient,
      status: orders.status,
      payoutStatus: orders.payoutStatus,
      negotiationId: quotes.negotiationId,
    }).from(orders)
      .innerJoin(products, eq(orders.productId, products.id))
      .innerJoin(quotes, eq(orders.quoteId, quotes.id))
      .where(and(
        eq(orders.merchantId, merchantId),
        gte(orders.createdAt, range.from),
        lt(orders.createdAt, range.to),
      )),
    db.select({ id: negotiations.id, createdAt: negotiations.createdAt })
      .from(negotiations)
      .where(and(
        eq(negotiations.merchantId, merchantId),
        gte(negotiations.createdAt, range.from),
        lt(negotiations.createdAt, range.to),
      )),
  ]);
  return aggregateSalesInsights({ orders: orderRows, negotiations: negotiationRows, ...range });
}

export async function getPendingPayoutSummary(merchantId: string): Promise<{ count: number; amountCents: number }> {
  const rows = await getDb().select({
    flow: orders.flow,
    status: orders.status,
    payoutStatus: orders.payoutStatus,
    netCents: orders.netCents,
  }).from(orders).where(eq(orders.merchantId, merchantId));
  const pending = rows.filter((row) => isPendingPayout({ ...row, status: row.status }));
  return {
    count: pending.length,
    amountCents: pending.reduce((sum, row) => sum + (row.netCents ?? 0), 0),
  };
}
