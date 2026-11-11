import { Suspense } from "react";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireMerchant } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { negotiations, products } from "@/lib/db/schema";
import { formatCents } from "@/lib/mcp/public";
import { MerchantNegotiationsSkeleton } from "@/components/merchant/page-skeletons";

function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}

export default function MerchantNegotiationsPage() {
  return <Suspense fallback={<MerchantNegotiationsSkeleton />}><MerchantNegotiationsContent /></Suspense>;
}

async function MerchantNegotiationsContent() {
  const merchant = await requireMerchant();
  const rows = await getDb().select({
    id: negotiations.id,
    clientName: negotiations.clientName,
    round: negotiations.round,
    status: negotiations.status,
    lastOfferCents: negotiations.lastOfferCents,
    updatedAt: negotiations.updatedAt,
    productTitle: products.title,
  }).from(negotiations)
    .innerJoin(products, eq(negotiations.productId, products.id))
    .where(and(eq(negotiations.merchantId, merchant.id), eq(products.merchantId, merchant.id)))
    .orderBy(desc(negotiations.updatedAt))
    .limit(100);

  return (
    <>
      <div className="negotiations-page-head">
        <div>
          <h1 className="merchant-page-title">Negotiations</h1>
          <p className="merchant-page-subtitle">Every offer stays inside your shop&apos;s pricing rules. Open a conversation to see how the pricing brain chose its next move.</p>
        </div>
        <Badge className="agent-ready-badge" variant="outline">MCP activity</Badge>
      </div>

      {rows.length === 0 ? (
        <section className="products-empty negotiations-empty">
          <h2>No agent conversations yet</h2>
          <p>When an agent requests an offer on one of your published products, the conversation and its pricing decisions will appear here.</p>
          <Button asChild variant="outline"><Link href="/merchant/products">View products</Link></Button>
        </section>
      ) : (
        <div className="products-table-shell negotiations-table-shell">
          <Table className="negotiations-table">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Agent client</TableHead>
                <TableHead>Rounds</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last offer</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="negotiation-product-cell">
                    <Link href={`/merchant/negotiations/${row.id}`}>{row.productTitle}</Link>
                  </TableCell>
                  <TableCell><span className="negotiation-client-name">{row.clientName}</span></TableCell>
                  <TableCell className="negotiation-number">{row.round} / 6</TableCell>
                  <TableCell><Badge className={`negotiation-status-badge ${row.status}`} variant="outline">{formatStatus(row.status)}</Badge></TableCell>
                  <TableCell className="negotiation-number">{row.lastOfferCents === null ? "—" : formatCents(row.lastOfferCents)}</TableCell>
                  <TableCell>{row.updatedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
