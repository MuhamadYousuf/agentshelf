import { desc, eq, sql } from "drizzle-orm";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { AnalyticsCharts } from "@/components/merchant/analytics-charts";
import { CopilotPanel } from "@/components/merchant/copilot-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireMerchant } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { products, orders } from "@/lib/db/schema";
import { formatCategory } from "@/lib/commerce/categories";
import { getPendingPayoutSummary, getSalesInsights } from "@/lib/merchant/analytics";
import { MerchantOverviewSkeleton } from "@/components/merchant/page-skeletons";

const currency = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function MerchantOverviewPage() {
  return <Suspense fallback={<MerchantOverviewSkeleton />}><MerchantOverviewContent /></Suspense>;
}

async function MerchantOverviewContent() {
  const merchant = await requireMerchant();
  const now = new Date();
  const sevenDays = { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000), to: now };
  const fourteenDays = { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 13)), to: now };
  const db = getDb();
  const [week, fortnight, payouts, statsResult, recentProducts, orderCount] = await Promise.all([
    getSalesInsights(merchant.id, sevenDays),
    getSalesInsights(merchant.id, fourteenDays),
    getPendingPayoutSummary(merchant.id),
    db.select({
      total: sql<number>`count(*)::int`,
      published: sql<number>`count(*) filter (where ${products.status} = 'published')::int`,
      drafts: sql<number>`count(*) filter (where ${products.status} = 'draft')::int`,
      stockOut: sql<number>`count(*) filter (where ${products.status} = 'published' and ${products.stock} - ${products.reserved} <= 0)::int`,
    }).from(products).where(eq(products.merchantId, merchant.id)),
    db.select({ id: products.id, title: products.title, category: products.category, status: products.status, listPriceCents: products.listPriceCents, images: products.images, updatedAt: products.updatedAt })
      .from(products).where(eq(products.merchantId, merchant.id)).orderBy(desc(products.updatedAt)).limit(5),
    db.select({ count: sql<number>`count(*)::int` }).from(orders).where(eq(orders.merchantId, merchant.id)),
  ]);
  const stats = statsResult[0] ?? { total: 0, published: 0, drafts: 0, stockOut: 0 };
  const totalOrders = orderCount[0]?.count ?? 0;

  return (
    <div className="merchant-overview">
      <div className="listing-review-head dashboard-heading">
        <div>
          <h1 className="merchant-page-title">Overview</h1>
          <p className="merchant-page-subtitle">Your shop at a glance, with agent sales alongside your storefront.</p>
        </div>
        <div className="merchant-page-actions">
          <Button asChild size="lg"><Link href="/merchant/capture"><Plus aria-hidden="true" size={16} /> Capture a product</Link></Button>
          <CopilotPanel />
        </div>
      </div>

      <section aria-label="Sales for the last seven days" className="merchant-kpi-grid">
        <article className="merchant-kpi merchant-kpi-primary">
          <span className="merchant-kpi-label">Agent revenue <span>7d</span></span>
          <strong className="merchant-kpi-value">{currency(week.agentRevenueCents)}</strong>
          <span className="merchant-kpi-foot">{week.agentSharePct.toFixed(0)}% of {currency(week.totalRevenueCents)} total</span>
        </article>
        <article className="merchant-kpi">
          <span className="merchant-kpi-label">Orders from agents</span>
          <strong className="merchant-kpi-value">{week.agentOrderCount}</strong>
          <span className="merchant-kpi-foot">Completed in the last 7 days</span>
        </article>
        <article className="merchant-kpi">
          <span className="merchant-kpi-label">Avg negotiated discount</span>
          <strong className="merchant-kpi-value">{week.averageNegotiatedDiscountPct.toFixed(1)}%</strong>
          <span className="merchant-kpi-foot">Across completed agent orders</span>
        </article>
        <article className="merchant-kpi">
          <span className="merchant-kpi-label">Negotiation → order</span>
          <strong className="merchant-kpi-value">{week.negotiationConversionPct.toFixed(0)}%</strong>
          <span className="merchant-kpi-foot">{week.convertedNegotiationCount} of {week.negotiationCount} conversations</span>
        </article>
        <article className="merchant-kpi merchant-kpi-payout">
          <span className="merchant-kpi-label">Payouts pending</span>
          <strong className="merchant-kpi-value">{payouts.count}</strong>
          <span className="merchant-kpi-foot">{currency(payouts.amountCents)} awaiting release</span>
        </article>
      </section>

      {totalOrders === 0 && <div className="merchant-first-order-note"><Sparkles aria-hidden="true" size={16} /><span>No orders yet. Your first completed storefront or agent sale will bring the charts to life.</span><Link href="/merchant/orders">View orders <ArrowRight aria-hidden="true" size={14} /></Link></div>}
      <AnalyticsCharts insights={fortnight} />

      <section aria-label="Product statistics" className="merchant-catalog-overview">
        <div className="merchant-catalog-topline">
          <div><h2>Catalog</h2><p>Listing health and recent edits</p></div>
          <Button asChild size="sm" variant="outline"><Link href="/merchant/products">Manage catalog <ArrowRight aria-hidden="true" size={14} /></Link></Button>
        </div>
        <div className="merchant-catalog-stats">
          <div><strong>{stats.published}</strong><span>Published</span></div>
          <div><strong>{stats.drafts}</strong><span>Drafts</span></div>
          <div><strong>{stats.stockOut}</strong><span>Stock out</span></div>
          <div><strong>{stats.total}</strong><span>Total products</span></div>
        </div>
        {stats.total === 0 ? (
          <div className="merchant-catalog-empty"><span>Your catalog is ready for its first listing.</span><Button asChild size="sm"><Link href="/merchant/capture">Capture a product</Link></Button></div>
        ) : (
          <div className="merchant-recent-list merchant-recent-compact">
            {recentProducts.map((product) => {
              const image = product.images[0];
              return <Link className="merchant-recent-row" href={`/merchant/products/${product.id}`} key={product.id}>
                <span className="merchant-recent-thumb">{image && <Image alt="" fill sizes="44px" src={`/api/images/${image.id}`} unoptimized />}</span>
                <span><span className="merchant-recent-title">{product.title || "Untitled draft"}</span><span className="merchant-recent-meta">{formatCategory(product.category)} · Updated {product.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></span>
                <span className="merchant-recent-price">{currency(product.listPriceCents)} <Badge className={`product-state-badge ${product.status}`} variant="outline">{product.status}</Badge></span>
              </Link>;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
