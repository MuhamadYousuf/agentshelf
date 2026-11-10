import { desc, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { ProductTableRow } from "@/components/merchant/product-table-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireMerchant } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { products } from "@/lib/db/schema";

type ProductsPageProps = { searchParams: Promise<{ status?: string }> };

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatUpdated(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default async function MerchantProductsPage({ searchParams }: ProductsPageProps) {
  const merchant = await requireMerchant();
  const { status } = await searchParams;
  const allProducts = await getDb()
    .select({
      id: products.id,
      title: products.title,
      listPriceCents: products.listPriceCents,
      stock: products.stock,
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
        <div className="products-table-shell">
          <Table className="products-table">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>List price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>PayPal Catalog</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleProducts.map((product) => {
                const image = product.images[0];
                const pending = product.status === "published" && !product.paypalProductId;
                return (
                  <ProductTableRow href={`/merchant/products/${product.id}`} key={product.id} label={`Review ${product.title || "untitled draft"}`}>
                    <TableCell className="product-title-cell">
                      <span className="product-table-item">
                        <span className="product-table-thumb">
                          {image && <Image alt="" fill sizes="42px" src={`/api/images/${image.id}`} unoptimized />}
                        </span>
                        <span>{product.title || "Untitled draft"}</span>
                      </span>
                    </TableCell>
                    <TableCell>{formatPrice(product.listPriceCents)}</TableCell>
                    <TableCell>{product.stock}</TableCell>
                    <TableCell><Badge className={`product-state-badge ${product.status}`} variant="outline">{product.status}</Badge></TableCell>
                    <TableCell>
                      {product.paypalProductId ? (
                        <span className="paypal-state synced">Synced</span>
                      ) : pending ? (
                        <span className="paypal-state pending">Pending</span>
                      ) : (
                        <span className="paypal-state">—</span>
                      )}
                    </TableCell>
                    <TableCell>{formatUpdated(product.updatedAt)}</TableCell>
                  </ProductTableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
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
