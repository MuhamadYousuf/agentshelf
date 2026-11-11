"use client";

import dynamic from "next/dynamic";
import type { NegotiationGridRow } from "@/lib/merchant/negotiations-grid";

const NegotiationsGrid = dynamic(
  () => import("./negotiations-grid").then((module) => module.NegotiationsGrid),
  {
    ssr: false,
    loading: () => <div aria-busy="true" className="negotiations-grid-shell merchant-grid-lazy-placeholder" role="status">Loading negotiation table…</div>,
  },
);

export function LazyNegotiationsGrid({ rows }: { rows: NegotiationGridRow[] }) {
  return <NegotiationsGrid rows={rows} />;
}
