import { config } from "dotenv";

config({ path: ".env.local" });

import { and, eq, inArray, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db";
import { signQuote, signedQuotePayload } from "@/lib/commerce/quotes";
import { buildDemoDeletionPlan } from "@/lib/db/demo-reset-plan";
import { generateDemoHistory } from "@/lib/db/demo-history";
import { merchants, negotiations, orders, products, quotes } from "@/lib/db/schema";

const DEMO_EMAILS = ["maya@demo.agentshelf.dev", "lahore@demo.agentshelf.dev"] as const;
const DEMO_HISTORY_SEED = "agentshelf-p08-history-v1";
let resetStage = "startup";

async function resetDemoHistory(): Promise<void> {
  // This allowlist is intentionally fixed so caller-supplied IDs cannot widen reset scope.
  const db = getDb();
  const now = new Date();
  resetStage = "load demo shops";
  const shops = await db.select({ id: merchants.id, email: merchants.email })
    .from(merchants)
    .where(inArray(merchants.email, [...DEMO_EMAILS]));
  if (shops.length !== DEMO_EMAILS.length) {
    throw new Error("Both demo shops must be seeded before demo history can be reset.");
  }
  const merchantIds = shops.map((shop) => shop.id);

  resetStage = "load existing demo-shop rows";
  const [orderRows, negotiationRows, quoteRows] = await Promise.all([
    db.select({
      id: orders.id,
      merchantId: orders.merchantId,
      productId: orders.productId,
      quoteId: orders.quoteId,
      status: orders.status,
      isDemo: orders.isDemo,
      buyerNote: orders.buyerNote,
      qty: orders.qty,
      createdAt: orders.createdAt,
    }).from(orders).where(inArray(orders.merchantId, merchantIds)),
    db.select({ id: negotiations.id, merchantId: negotiations.merchantId, isDemo: negotiations.isDemo })
      .from(negotiations).where(inArray(negotiations.merchantId, merchantIds)),
    db.select({ id: quotes.id, merchantId: quotes.merchantId, negotiationId: quotes.negotiationId })
      .from(quotes).where(inArray(quotes.merchantId, merchantIds)),
  ]);
  const plan = buildDemoDeletionPlan({
    merchantIds,
    orders: orderRows,
    negotiations: negotiationRows,
    quotes: quoteRows,
    now,
  });
  const productsById = new Map(orderRows.map((row) => [row.id, { productId: row.productId, qty: row.qty, status: row.status }]));

  resetStage = "check seeded products";
  const productRows = await db.select({
    id: products.id,
    merchantId: products.merchantId,
    title: products.title,
    listPriceCents: products.listPriceCents,
    floorPriceCents: products.floorPriceCents,
    costCents: products.costCents,
  }).from(products).where(and(inArray(products.merchantId, merchantIds), eq(products.status, "published")));
  if (productRows.length < 9) {
    throw new Error("Expected at least nine published products across the two demo shops.");
  }
  resetStage = "generate signed demo history";
  const history = generateDemoHistory({ seed: DEMO_HISTORY_SEED, products: productRows, now });
  const signedQuotes = history.quotes.map((quote) => ({
    ...quote,
    signature: signQuote(signedQuotePayload(quote)),
  }));

  resetStage = "replace scoped rows in transaction";
  await db.transaction(async (tx) => {
    for (const orderId of plan.reservationOrderIds) {
      const reservation = productsById.get(orderId);
      if (!reservation) continue;
      await tx.update(products).set({
        reserved: sql`GREATEST(0, ${products.reserved} - ${reservation.qty})`,
      }).where(and(eq(products.id, reservation.productId), inArray(products.merchantId, merchantIds)));
    }
    if (plan.orderIds.length > 0) {
      await tx.delete(orders).where(and(
        inArray(orders.id, plan.orderIds),
        inArray(orders.merchantId, merchantIds),
      ));
    }
    if (plan.quoteIds.length > 0) {
      await tx.delete(quotes).where(and(
        inArray(quotes.id, plan.quoteIds),
        inArray(quotes.merchantId, merchantIds),
      ));
    }
    if (plan.negotiationIds.length > 0) {
      await tx.delete(negotiations).where(and(
        inArray(negotiations.id, plan.negotiationIds),
        inArray(negotiations.merchantId, merchantIds),
      ));
    }

    const openReservations = await tx.select({ productId: orders.productId, qty: orders.qty })
      .from(orders)
      .where(and(
        inArray(orders.merchantId, merchantIds),
        inArray(orders.status, ["created", "approval_required", "approved"]),
      ));
    const reservedByProduct = new Map<string, number>();
    for (const order of openReservations) {
      reservedByProduct.set(order.productId, (reservedByProduct.get(order.productId) ?? 0) + order.qty);
    }
    const demoProducts = await tx.select({ id: products.id })
      .from(products).where(inArray(products.merchantId, merchantIds));
    for (const product of demoProducts) {
      await tx.update(products).set({ reserved: reservedByProduct.get(product.id) ?? 0 })
        .where(and(eq(products.id, product.id), inArray(products.merchantId, merchantIds)));
    }

    if (history.negotiations.length > 0) await tx.insert(negotiations).values(history.negotiations);
    if (signedQuotes.length > 0) await tx.insert(quotes).values(signedQuotes);
    if (history.orders.length > 0) await tx.insert(orders).values(history.orders);
  });

  resetStage = "complete";
  console.info("Demo history reset complete.");
  console.info(`Demo shops: ${shops.length}; published products retained: ${productRows.length}.`);
  console.info(`Deleted demo/live orders: ${plan.orderIds.length}; demo negotiations: ${plan.negotiationIds.length}; quotes: ${plan.quoteIds.length}.`);
  console.info(`Released reservation rows before recompute: ${plan.reservationOrderIds.length}.`);
  console.info(`Inserted demo orders: ${history.orders.length}; agent negotiations: ${history.negotiations.length}; signed quotes: ${signedQuotes.length}.`);
}

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    console.error("Refusing demo reset without --confirm. No database connection was opened.");
    process.exitCode = 2;
    return;
  }
  try {
    await resetDemoHistory();
  } catch (error: unknown) {
    const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : "unknown";
    console.error(`Demo reset failed during ${resetStage} (database error code ${code}); details were suppressed.`);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

void main();

