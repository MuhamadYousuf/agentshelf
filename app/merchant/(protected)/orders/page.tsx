import { desc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireMerchant } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { merchants, orders, products } from "@/lib/db/schema";

function formatPrice(cents: number | null): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export default async function MerchantOrdersPage() {
  const merchant = await requireMerchant();
  const merchantOrders = await getDb().select({
    id: orders.id,
    createdAt: orders.createdAt,
    productTitle: products.title,
    qty: orders.qty,
    amountCents: orders.amountCents,
    netCents: orders.netCents,
    flow: orders.flow,
    agentClient: orders.agentClient,
    status: orders.status,
    buyerEmail: orders.buyerEmail,
  }).from(orders).innerJoin(products, eq(orders.productId, products.id))
    .innerJoin(merchants, eq(orders.merchantId, merchants.id))
    .where(eq(orders.merchantId, merchant.id))
    .orderBy(desc(orders.createdAt));

  if (merchantOrders.length === 0) {
    return (
      <>
        <div className="listing-review-head">
          <div><h1 className="merchant-page-title">Orders</h1><p className="merchant-page-subtitle">Payments and fulfillment for your storefront and agent sales.</p></div>
        </div>
        <section className="products-empty"><h2>No orders yet</h2><p>Completed and pending checkouts will appear here.</p></section>
      </>
    );
  }

  return (
    <>
      <div className="listing-review-head">
        <div><h1 className="merchant-page-title">Orders</h1><p className="merchant-page-subtitle">Payments and fulfillment for your storefront and agent sales.</p></div>
      </div>
      <div className="products-table-shell merchant-orders-shell">
        <Table className="merchant-orders-table">
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead>Total</TableHead>
            <TableHead>Net</TableHead><TableHead>Flow</TableHead><TableHead>Agent client</TableHead><TableHead>Status</TableHead><TableHead>Buyer email</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {merchantOrders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{order.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</TableCell>
                <TableCell className="product-title-cell">{order.productTitle}</TableCell>
                <TableCell>{order.qty}</TableCell>
                <TableCell>{formatPrice(order.amountCents)}</TableCell>
                <TableCell>{formatPrice(order.netCents)}</TableCell>
                <TableCell>{order.flow.replaceAll("_", " ")}</TableCell>
                <TableCell>{order.agentClient}</TableCell>
                <TableCell><Badge variant="outline">{statusLabel(order.status)}</Badge></TableCell>
                <TableCell>{order.buyerEmail ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
