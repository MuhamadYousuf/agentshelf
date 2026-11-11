"use client";

import dynamic from "next/dynamic";
import type { ProductGridRow } from "@/lib/merchant/products-grid";

const ProductsGrid = dynamic(
  () => import("./products-grid").then((module) => module.ProductsGrid),
  {
    ssr: false,
    loading: () => (
      <section aria-busy="true" className="products-grid-section">
        <div className="products-grid-toolbar"><div className="products-grid-search">Loading catalog table…</div></div>
        <div className="products-grid-shell merchant-grid-lazy-placeholder" role="status">Preparing editable product grid…</div>
        <p className="products-grid-note">Product edits will be available when the table loads.</p>
      </section>
    ),
  },
);

export function LazyProductsGrid({ initialRows }: { initialRows: ProductGridRow[] }) {
  return <ProductsGrid initialRows={initialRows} />;
}
