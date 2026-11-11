import { Suspense } from "react";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LazyNegotiationsGrid } from "@/components/merchant/lazy-negotiations-grid";
import { MerchantNegotiationsSkeleton } from "@/components/merchant/page-skeletons";
import { requireMerchant } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { negotiations, products } from "@/lib/db/schema";
import { mapNegotiationsForGrid } from "@/lib/merchant/negotiations-grid";

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
    state: negotiations.state,
    lastOfferCents: negotiations.lastOfferCents,
    updatedAt: negotiations.updatedAt,
    messages: negotiations.messages,
    productTitle: products.title,
    listPriceCents: products.listPriceCents,
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
        <LazyNegotiationsGrid rows={mapNegotiationsForGrid(rows)} />
      )}
    </>
  );
}
