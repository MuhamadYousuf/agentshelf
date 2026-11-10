import { and, eq } from "drizzle-orm";
import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Bot, Box, PackageCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { BuyForm } from "@/components/storefront/buy-form";
import { ProductImage } from "@/components/storefront/product-image";
import { availableStock } from "@/lib/commerce/policy";
import { formatCategory } from "@/lib/commerce/categories";
import { getDb } from "@/lib/db";
import { getAppUrl } from "@/lib/env";
import { merchants, products } from "@/lib/db/schema";

type ProductPageProps = {
  params: Promise<{ slug: string; productId: string }>;
  searchParams: Promise<{ checkout?: string }>;
};

export const metadata: Metadata = { title: "Handmade product" };

function price(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

async function StoreProductContent({ params, searchParams }: ProductPageProps) {
  const [{ slug, productId }, query] = await Promise.all([params, searchParams]);
  const [row] = await getDb().select({
    merchantId: merchants.id,
    shopName: merchants.name,
    shopSlug: merchants.slug,
    productId: products.id,
    title: products.title,
    description: products.description,
    category: products.category,
    attributes: products.attributes,
    images: products.images,
    listPriceCents: products.listPriceCents,
    stock: products.stock,
    reserved: products.reserved,
  }).from(products).innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(and(
      eq(products.id, productId),
      eq(merchants.slug, slug),
      eq(products.status, "published"),
    )).limit(1);
  if (!row) notFound();

  const available = availableStock(row);
  const image = row.images[0];
  const attributes = Object.entries(row.attributes);
  const endpoint = `${getAppUrl().replace(/\/+$/, "")}/api/mcp`;

  return (
    <>
      <header className="storefront-header">
        <div className="page-wrap storefront-header-inner">
          <Logo />
          <Link className="product-back-link" href={`/s/${row.shopSlug}`}><ArrowLeft aria-hidden="true" size={15} /> {row.shopName}</Link>
        </div>
      </header>
      <main className="page-wrap shop-product-page">
        <div className="shop-product-gallery">
          <div className="shop-product-main-image">
            {image ? (
              <Image alt={row.title} fill priority sizes="(max-width: 800px) 100vw, 56vw" src={`/api/images/${image.id}`} unoptimized />
            ) : <ProductImage category={row.category} title={row.title} />}
          </div>
          {row.images.length > 1 && (
            <div aria-label="Product photos" className="shop-product-thumbnails">
              {row.images.map((photo, index) => (
                <div className="shop-product-thumbnail" key={photo.id}>
                  <Image alt={`${row.title}, view ${index + 1}`} fill sizes="84px" src={`/api/images/${photo.id}`} unoptimized />
                </div>
              ))}
            </div>
          )}
        </div>

        <section className="shop-product-details">
          <span className="product-card-category">{formatCategory(row.category)}</span>
          <h1 className="shop-product-title">{row.title}</h1>
          <p className="shop-product-price">{price(row.listPriceCents)}</p>
          <p className="shop-shipping-note">Price includes shipping.</p>
          <p className="shop-product-description">{row.description}</p>
          {query.checkout === "cancelled" && <p className="shop-checkout-message" role="status">Checkout cancelled. Your reserved stock has been released.</p>}
          {query.checkout === "unavailable" && <p className="shop-checkout-message unavailable" role="status">This checkout could not be started. Check the available quantity and try again.</p>}

          {attributes.length > 0 && (
            <dl className="shop-product-attributes">
              {attributes.map(([key, value]) => (
                <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>
              ))}
            </dl>
          )}

          <div className={`shop-product-availability ${available > 0 ? "in-stock" : "out-stock"}`}>
            {available > 0 ? <PackageCheck aria-hidden="true" size={17} /> : <Box aria-hidden="true" size={17} />}
            {available > 0 ? `${available} available` : "Currently out of stock"}
          </div>
          {available > 0 ? (
            <BuyForm maxQuantity={Math.min(10, available)} productId={row.productId} shopName={row.shopName} shopSlug={row.shopSlug} />
          ) : null}

          <p className="shop-agent-note"><Bot aria-hidden="true" size={16} /> <span>Agents can negotiate this item via MCP: <code>{endpoint}</code></span></p>
        </section>
      </main>
    </>
  );
}

function ProductPageFallback() {
  return <main aria-busy="true" className="page-wrap shop-product-page"><div className="shop-product-main-image animate-pulse" /><div><div className="h-12 w-2/3 animate-pulse rounded bg-muted" /><div className="mt-5 h-5 w-1/3 animate-pulse rounded bg-muted" /></div></main>;
}

export default function StoreProductPage(props: ProductPageProps) {
  return <Suspense fallback={<ProductPageFallback />}><StoreProductContent {...props} /></Suspense>;
}
