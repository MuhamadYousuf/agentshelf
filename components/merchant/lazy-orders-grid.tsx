"use client";

import dynamic from "next/dynamic";
import type { MerchantOrderRow } from "@/lib/merchant/orders-feed";

const OrdersGrid = dynamic(
  () => import("./orders-grid").then((module) => module.OrdersGrid),
  {
    ssr: false,
    loading: () => (
      <div aria-busy="true" className="merchant-orders-page">
        <div className="listing-review-head orders-page-heading">
          <div><h1 className="merchant-page-title">Orders</h1><p className="merchant-page-subtitle">Every storefront and agent sale, in one live view.</p></div>
        </div>
        <div className="orders-toolbar"><div className="orders-search">Loading order filters…</div></div>
        <div className="orders-grid-shell merchant-grid-lazy-placeholder" role="status">Loading live order table…</div>
      </div>
    ),
  },
);

export function LazyOrdersGrid({ initialRows, initialCursor }: { initialRows: MerchantOrderRow[]; initialCursor: string }) {
  return <OrdersGrid initialCursor={initialCursor} initialRows={initialRows} />;
}
