import { desc, eq, sql } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, LayoutDashboard, Plus } from "lucide-react";
import { MerchantEmptyPage } from "@/components/merchant/empty-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireMerchant } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { formatCategory } from "@/lib/commerce/categories";

export default async function MerchantOverviewPage() {
  const merchant = await requireMerchant();
  const db = getDb();
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      published: sql<number>`count(*) filter (where ${products.status} = 'published')::int`,
      drafts: sql<number>`count(*) filter (where ${products.status} = 'draft')::int`,
      stockOut: sql<number>`count(*) filter (where ${products.status} = 'published' and ${products.stock} - ${products.reserved} <= 0)::int`,
    })
    .from(products)
    .where(eq(products.merchantId, merchant.id));

  if (!stats || stats.total === 0) {
    return (
      <MerchantEmptyPage
        actionHref="/merchant/capture"
        actionLabel="Capture a product"
        description="Start with a few product photos. Review each listing draft before it becomes visible to agents."
        emptyTitle="Your shop is ready for its first product."
        icon={LayoutDashboard}
        subtitle="A clear view of your catalog, orders, and agent activity starts here."
        title="Overview"
      />
    );
  }

  const recentProducts = await db
    .select({
      id: products.id,
      title: products.title,
      category: products.category,
      status: products.status,
      listPriceCents: products.listPriceCents,
      images: products.images,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(eq(products.merchantId, merchant.id))
    .orderBy(desc(products.updatedAt))
    .limit(5);

  const formatPrice = (cents: number) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);

  return (
    <>
      <div className="listing-review-head">
        <div>
          <h1 className="merchant-page-title">Overview</h1>
          <p className="merchant-page-subtitle">A live snapshot of your shop and its recent listings.</p>
        </div>
        <div className="merchant-page-actions">
          <Button asChild size="lg">
            <Link href="/merchant/capture"><Plus aria-hidden="true" size={16} /> Capture a product</Link>
          </Button>
        </div>
      </div>

      <section aria-label="Product statistics" className="merchant-stats">
        <div className="merchant-stat"><span className="merchant-stat-value">{stats.published}</span><span className="merchant-stat-label">Published</span></div>
        <div className="merchant-stat"><span className="merchant-stat-value">{stats.drafts}</span><span className="merchant-stat-label">Drafts</span></div>
        <div className="merchant-stat"><span className="merchant-stat-value">{stats.stockOut}</span><span className="merchant-stat-label">Stock out</span></div>
      </section>

      <div className="merchant-section-head">
        <h2>Recent products</h2>
        <Link href="/merchant/products">View all <ArrowRight aria-hidden="true" size={14} /></Link>
      </div>
      <div className="merchant-recent-list">
        {recentProducts.map((product) => {
          const image = product.images[0];
          return (
            <Link className="merchant-recent-row" href={`/merchant/products/${product.id}`} key={product.id}>
              <span className="merchant-recent-thumb">
                {image && <Image alt="" fill sizes="54px" src={`/api/images/${image.id}`} unoptimized />}
              </span>
              <span>
                <span className="merchant-recent-title">{product.title || "Untitled draft"}</span>
                <span className="merchant-recent-meta">{formatCategory(product.category)} · Updated {product.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </span>
              <span className="merchant-recent-price">
                {formatPrice(product.listPriceCents)} <Badge className={`product-state-badge ${product.status}`} variant="outline">{product.status}</Badge>
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
