"use client";

import { useEffect, useState } from "react";
import { AgCharts } from "ag-charts-react";
import { AllCommunityModule, type AgCartesianChartOptions, type AgPolarChartOptions } from "ag-charts-community";
import type { SalesInsights } from "@/lib/merchant/analytics";

type RevenuePoint = SalesInsights["revenueByDay"][number];
type ClientPoint = { client: string; revenueCents: number; orderCount: number };

const money = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
}).format(value / 100);

function chartTheme(dark: boolean) {
  return {
    baseTheme: dark ? "ag-default-dark" as const : "ag-default" as const,
    palette: { fills: ["#3b2ed0", "#e4a431", "#728b7c", "#cf8163"], strokes: ["#3b2ed0", "#e4a431", "#728b7c", "#cf8163"] },
    params: {
      backgroundColor: dark ? "#191821" : "#fffdfa",
      foregroundColor: dark ? "#f6f3ee" : "#242331",
      fontFamily: "Inter, Arial, sans-serif",
      accentColor: "#3b2ed0",
    },
  };
}

export function AnalyticsCharts({ insights }: { insights: SalesInsights }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const update = () => setDark(document.documentElement.classList.contains("dark") || document.documentElement.dataset.theme === "dark");
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, []);
  const dailyOptions: AgCartesianChartOptions<RevenuePoint> = {
    data: insights.revenueByDay,
    theme: chartTheme(dark),
    animation: { enabled: false },
    legend: { position: "bottom" },
    axes: {
      x: { type: "category", position: "bottom", label: { formatter: ({ value }) => String(value).slice(5).replace("-", "/") } },
      y: { type: "number", position: "left", label: { formatter: ({ value }) => money(Number(value)) }, gridLine: { style: [{ stroke: "#ece8e1", lineDash: [3, 3] }] } },
    },
    series: [
      { type: "bar", direction: "vertical", xKey: "day", yKey: "agentRevenueCents", yName: "Agent", stacked: true, cornerRadius: 4, tooltip: { renderer: ({ datum }) => ({ title: datum.day, content: `Agent · ${money(datum.agentRevenueCents)}` }) } },
      { type: "bar", direction: "vertical", xKey: "day", yKey: "storefrontRevenueCents", yName: "Storefront", stacked: true, cornerRadius: 4, tooltip: { renderer: ({ datum }) => ({ title: datum.day, content: `Storefront · ${money(datum.storefrontRevenueCents)}` }) } },
    ],
  };
  const clients: ClientPoint[] = insights.revenueByAgentClient.length > 0
    ? insights.revenueByAgentClient
    : [{ client: "No agent orders yet", revenueCents: 1, orderCount: 0 }];
  const clientOptions: AgPolarChartOptions<ClientPoint> = {
    data: clients,
    theme: chartTheme(dark),
    animation: { enabled: false },
    legend: { position: "bottom" },
    series: [{
      type: "donut",
      angleKey: "revenueCents",
      calloutLabelKey: "client",
      sectorLabelKey: "revenueCents",
      innerRadiusRatio: 0.68,
      sectorLabel: { color: "#fffdfa", fontWeight: 600, formatter: ({ value }) => insights.revenueByAgentClient.length ? money(Number(value)) : "" },
      tooltip: { renderer: ({ datum }) => ({ title: datum.client, content: `${money(datum.revenueCents)} · ${datum.orderCount} orders` }) },
    }],
  };

  return (
    <section aria-label="Sales charts" className="merchant-chart-grid">
      <article className="merchant-chart-panel merchant-chart-wide">
        <div className="merchant-chart-heading"><div><h2>Revenue by day</h2><p>Agent and storefront sales · last 14 days</p></div><span className="chart-range-label">14 days</span></div>
        <div className="merchant-chart-canvas" role="img" aria-label="Stacked columns compare daily agent and storefront revenue for the last 14 days"><AgCharts modules={AllCommunityModule} options={dailyOptions} /></div>
      </article>
      <article className="merchant-chart-panel">
        <div className="merchant-chart-heading"><div><h2>Agent revenue mix</h2><p>By agent client · last 14 days</p></div></div>
        <div className="merchant-chart-canvas merchant-donut-canvas" role="img" aria-label="Donut chart of agent revenue by client"><AgCharts modules={AllCommunityModule} options={clientOptions} /></div>
      </article>
    </section>
  );
}
