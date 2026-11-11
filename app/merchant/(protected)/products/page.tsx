import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { LazyProductsGrid } from "@/components/merchant/lazy-products-grid";
import { Button } from "@/components/ui/button";
import { requireMerchant } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { mapProductsForGrid } from "@/lib/merchant/products-grid";

type ProductsPageProps = { searchParams: Promise<{ status?: string }> };

export default async function MerchantProductsPage({ searchParams }: ProductsPageProps) {
  const merchant = await requireMerchant();
  const { status } = await searchParams;
  const allProducts = await getDb()
    .select({
      id: products.id,
      title: products.title,
      category: products.category,
      listPriceCents: products.listPriceCents,
      floorPriceCents: products.floorPriceCents,
      stock: products.stock,
      reserved: products.reserved,
      status: products.status,
      images: products.images,
      paypalProductId: products.paypalProductId,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(eq(products.merchantId, merchant.id))
    .orderBy(desc(products.updatedAt));

  const selected = status === "published" || status === "drafts" ? status : "all";
  const visibleProducts = allProducts.filter((product) =>
    selected === "all" ||
    (selected === "published" && product.status === "published") ||
    (selected === "drafts" && product.status === "draft"),
  );
  const publishedCount = allProducts.filter((product) => product.status === "published").length;
  const draftCount = allProducts.filter((product) => product.status === "draft").length;
  const filters = [
    { id: "all", label: "All", count: allProducts.length, href: "/merchant/products" },
    { id: "published", label: "Published", count: publishedCount, href: "/merchant/products?status=published" },
    { id: "drafts", label: "Drafts", count: draftCount, href: "/merchant/products?status=drafts" },
  ];

  return (
    <>
      <div className="listing-review-head">
        <div>
          <h1 className="merchant-page-title">Products</h1>
          <p className="merchant-page-subtitle">Review your drafts and keep published listings up to date.</p>
        </div>
        <Button asChild size="lg"><Link href="/merchant/capture"><Plus aria-hidden="true" size={16} /> Capture a product</Link></Button>
      </div>

      <nav aria-label="Filter products" className="product-filter-tabs">
        {filters.map((filter) => (
          <Link
            aria-current={selected === filter.id ? "page" : undefined}
            className="product-filter-tab"
            href={filter.href}
            key={filter.id}
          >
            {filter.label}<span className="product-filter-count">{filter.count}</span>
          </Link>
        ))}
      </nav>

      {visibleProducts.length > 0 ? (
        <LazyProductsGrid initialRows={mapProductsForGrid(visibleProducts)} />
      ) : (
        <section className="products-empty">
          <h2>{allProducts.length === 0 ? "No products yet" : "Nothing in this view"}</h2>
          <p>{allProducts.length === 0 ? "Capture an item to create your first draft." : "Choose another filter or capture a new product."}</p>
          <Link href="/merchant/capture">Capture a product <ArrowRight aria-hidden="true" size={14} /></Link>
        </section>
      )}
    </>
  );
}
