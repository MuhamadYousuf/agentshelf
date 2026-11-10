import { and, asc, eq } from "drizzle-orm";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { CopyEndpoint } from "@/components/storefront/copy-endpoint";
import { ProductImage } from "@/components/storefront/product-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAppUrl } from "@/lib/env";
import { formatCategory } from "@/lib/commerce/categories";
import { getDb } from "@/lib/db";
import { merchants, products } from "@/lib/db/schema";

type StorePageProps = {
  params: Promise<{ slug: string }>;
};

export const metadata: Metadata = {
  title: "Independent maker storefronts",
};

function StorefrontFallback() {
  return (
    <main className="page-wrap storefront-main">
      <div aria-hidden="true" className="h-6 w-32 animate-pulse rounded bg-muted" />
      <div aria-hidden="true" className="mt-6 h-16 w-2/3 animate-pulse rounded bg-muted" />
      <div aria-hidden="true" className="mt-4 h-4 w-1/2 animate-pulse rounded bg-muted" />
      <div aria-hidden="true" className="mt-16 h-64 animate-pulse rounded-xl bg-muted" />
    </main>
  );
}

async function StorefrontContent({ params }: StorePageProps) {
  const { slug } = await params;
  const db = getDb();
  const [merchant] = await db
    .select({ id: merchants.id, name: merchants.name, slug: merchants.slug })
    .from(merchants)
    .where(eq(merchants.slug, slug))
    .limit(1);

  if (!merchant) notFound();

  const publishedProducts = await db
    .select({
      id: products.id,
      title: products.title,
      description: products.description,
      images: products.images,
      category: products.category,
      listPriceCents: products.listPriceCents,
      stock: products.stock,
      reserved: products.reserved,
    })
    .from(products)
    .where(
      and(
        eq(products.merchantId, merchant.id),
        eq(products.status, "published"),
      ),
    )
    .orderBy(asc(products.title));

  const visibleProducts = publishedProducts;
  const appUrl = getAppUrl().replace(/\/+$/, "");
  const mcpEndpoint = `${appUrl}/api/mcp`;

  return (
    <>
      <header className="storefront-header">
        <div className="page-wrap storefront-header-inner">
          <Logo />
          <Button asChild size="sm" variant="outline">
            <Link href="/merchant/login">Merchant sign in</Link>
          </Button>
        </div>
      </header>
      <main className="page-wrap storefront-main">
        <Badge className="agent-ready-badge" variant="outline">
          <Sparkles aria-hidden="true" size={13} /> Agent-ready
        </Badge>
        <h1 className="storefront-title">{merchant.name}</h1>
        <p className="storefront-description">
          A small-batch shop, open to thoughtful agent shopping. Each product
          follows the merchant&apos;s published price and availability.
        </p>
        <CopyEndpoint endpoint={mcpEndpoint} />

        <div className="storefront-products-head">
          <h2 className="storefront-products-title">Published products</h2>
          <span className="storefront-products-count">
            {visibleProducts.length} {visibleProducts.length === 1 ? "item" : "items"}
          </span>
        </div>

        {visibleProducts.length > 0 ? (
          <div className="product-grid">
            {visibleProducts.map((product) => {
              const image = product.images[0];
              const price = new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(product.listPriceCents / 100);

              return (
                <article className="product-card" key={product.id}>
                  <Link aria-label={`View ${product.title}`} className="product-card-link" href={`/s/${merchant.slug}/p/${product.id}`}>
                    <ProductImage category={product.category} imageId={image?.id} title={product.title} />
                    <div className="product-card-body">
                      <span className="product-card-category">{formatCategory(product.category)}</span>
                      <h3 className="product-card-title">{product.title}</h3>
                      <p className="product-card-description">{product.description}</p>
                      <div className="product-card-price">
                        <strong>{price}</strong>
                        <span>{Math.max(0, product.stock - product.reserved)} available</span>
                      </div>
                    </div>
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="storefront-empty">
            This shop is preparing its first agent-ready listings.
          </p>
        )}

        <Link className="coming-soon-link" href="/shopper">
          See how an agent shops <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </main>
    </>
  );
}

export default function StorefrontPage({ params }: StorePageProps) {
  return (
    <Suspense fallback={<StorefrontFallback />}>
      <StorefrontContent params={params} />
    </Suspense>
  );
}
