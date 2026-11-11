"use client";

import dynamic from "next/dynamic";
import type { SalesInsights } from "@/lib/merchant/analytics";

const AnalyticsCharts = dynamic(
  () => import("./analytics-charts").then((module) => module.AnalyticsCharts),
  {
    ssr: false,
    loading: () => (
      <section aria-busy="true" aria-label="Loading sales charts" className="merchant-chart-grid">
        <article className="merchant-chart-panel merchant-chart-wide">
          <div className="merchant-chart-heading"><div><h2>Revenue by day</h2><p>Agent and storefront sales · last 14 days</p></div><span className="chart-range-label">14 days</span></div>
          <div className="merchant-chart-canvas merchant-chart-loading" role="status">Preparing chart…</div>
        </article>
        <article className="merchant-chart-panel">
          <div className="merchant-chart-heading"><div><h2>Agent revenue mix</h2><p>By agent client · last 14 days</p></div></div>
          <div className="merchant-chart-canvas merchant-chart-loading" role="status">Preparing chart…</div>
        </article>
      </section>
    ),
  },
);

export function LazyAnalyticsCharts({ insights }: { insights: SalesInsights }) {
  return <AnalyticsCharts insights={insights} />;
}
