"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { Badge } from "@/components/ui/badge";
import type { NegotiationGridRow } from "@/lib/merchant/negotiations-grid";

ModuleRegistry.registerModules([AllCommunityModule]);

function money(cents: number | null): string {
  return cents === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function NegotiationsGrid({ rows }: { rows: NegotiationGridRow[] }) {
  const router = useRouter();
  const columnDefs = useMemo<ColDef<NegotiationGridRow>[]>(() => [
    { headerName: "Time", field: "time", pinned: "left", width: 138, minWidth: 128, valueFormatter: (params) => params.value ? new Date(params.value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—" },
    { headerName: "Product", field: "product", minWidth: 210, flex: 1.2 },
    { headerName: "Agent client", field: "agentClient", minWidth: 155 },
    { headerName: "Rounds", field: "rounds", width: 95, valueFormatter: (params) => `${params.value ?? 0} / 6` },
    { headerName: "Opening offer", field: "openingOfferCents", width: 138, valueFormatter: (params) => money(params.value ?? null) },
    { headerName: "Final price", field: "finalPriceCents", width: 130, valueFormatter: (params) => money(params.value ?? null) },
    { headerName: "Discount", field: "discountPct", width: 105, valueFormatter: (params) => params.value === null || params.value === undefined ? "—" : `${Number(params.value).toFixed(1)}%` },
    { headerName: "Outcome", field: "outcome", width: 112, cellRenderer: (params: { value?: NegotiationGridRow["outcome"] }) => params.value ? <Badge className={`negotiation-outcome-badge ${params.value}`} variant="outline">{params.value}</Badge> : null },
    { headerName: "Strategy", field: "strategyState", minWidth: 154, valueFormatter: (params) => params.value === "DEFECT_RECOVERY" ? "DEFECT_RECOVERY" : "COOPERATE" },
  ], []);

  return <div className="negotiations-grid-shell" aria-label="Negotiations grid">
    <AgGridReact<NegotiationGridRow>
      columnDefs={columnDefs}
      defaultColDef={{ resizable: true, sortable: true, filter: true, suppressHeaderMenuButton: false }}
      getRowId={(params) => params.data.id}
      onRowClicked={(event) => { if (event.data) router.push(`/merchant/negotiations/${event.data.id}`); }}
      rowData={rows}
      rowHeight={58}
      theme={themeQuartz.withParams({ accentColor: "#3b2ed0", backgroundColor: "#fffdfa", borderColor: "#e6e1d9", borderRadius: 12, chromeBackgroundColor: "#f4f1ec", fontFamily: "Inter, Arial, sans-serif", fontSize: 12, headerFontSize: 10, headerFontWeight: 650, headerHeight: 42, rowHeight: 58, selectedRowBackgroundColor: "#eeeafc", spacing: 5, wrapperBorderRadius: 14 })}
    />
  </div>;
}
