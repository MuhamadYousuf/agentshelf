"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type CellValueChangedEvent,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type ICellRendererParams,
} from "ag-grid-community";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import { editProductGridCellAction } from "@/lib/products/actions";
import { dollarsToCents } from "@/lib/security/product-input";
import { formatCategory } from "@/lib/commerce/categories";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildProductGridSummary,
  validateProductGridEdit,
  type ProductGridEditField,
  type ProductGridRow,
  type ProductGridSummary,
} from "@/lib/merchant/products-grid";

ModuleRegistry.registerModules([AllCommunityModule]);

type GridRow = ProductGridRow | ProductGridSummary;

const usdCents = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const usdDollars = (dollars: number) => usdCents(Math.round(dollars * 100));
const isSummary = (row: GridRow | undefined): row is ProductGridSummary => Boolean(row && "isSummary" in row && row.isSummary);

function ProductCell({ data }: ICellRendererParams<GridRow>) {
  if (!data) return null;
  if (isSummary(data)) return <strong>{data.title}</strong>;
  return <span className="product-grid-product-cell">
    <span className="product-grid-thumb">{data.thumbnailUrl && <Image alt={data.title} fill sizes="40px" src={data.thumbnailUrl} unoptimized />}</span>
    <span>{data.title}</span>
  </span>;
}

function ProductStateCell({ data }: ICellRendererParams<GridRow>) {
  if (!data || isSummary(data)) return null;
  return <Badge className={`product-state-badge ${data.status}`} variant="outline">{data.status}</Badge>;
}

function CatalogStateCell({ data }: ICellRendererParams<GridRow>) {
  if (!data || isSummary(data) || data.status !== "published") return <span className="product-grid-muted">—</span>;
  return data.paypalProductId
    ? <span className="paypal-state synced">Synced</span>
    : <span className="paypal-state pending">Pending</span>;
}

function parseDollarEditorValue(value: unknown): number {
  const cents = dollarsToCents(String(value));
  return Number.isNaN(cents) ? Number.NaN : cents / 100;
}

export function ProductsGrid({ initialRows }: { initialRows: ProductGridRow[] }) {
  const router = useRouter();
  const apiRef = useRef<GridApi<GridRow> | null>(null);
  const [rows, setRows] = useState(initialRows);
  const [quickFilter, setQuickFilter] = useState("");
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const summary = useMemo(() => buildProductGridSummary(rows), [rows]);
  const pinnedBottomRowData = useMemo<GridRow[]>(() => [summary], [summary]);

  const columnDefs = useMemo<ColDef<GridRow>[]>(() => [
    { headerName: "Product", field: "title", pinned: "left", minWidth: 245, flex: 1.4, cellRenderer: ProductCell, getQuickFilterText: (params) => `${params.data && !isSummary(params.data) ? `${params.data.title} ${formatCategory(params.data.category)}` : ""}` },
    { headerName: "Category", field: "category", minWidth: 130, valueFormatter: (params) => params.data && !isSummary(params.data) ? formatCategory(String(params.value)) : "—" },
    { headerName: "Status", field: "status", minWidth: 112, cellRenderer: ProductStateCell },
    {
      headerName: "List price", field: "listPriceDollars", minWidth: 120, editable: (params) => !saving && !isSummary(params.data),
      cellEditor: "agNumberCellEditor", valueParser: (params) => parseDollarEditorValue(params.newValue),
      valueFormatter: (params) => params.data && isSummary(params.data) ? `Stock value · ${usdCents(params.data.stockValueCents)}` : usdDollars(Number(params.value ?? 0)),
    },
    {
      headerName: "Floor price", field: "floorPriceDollars", minWidth: 120, editable: (params) => !saving && !isSummary(params.data),
      cellEditor: "agNumberCellEditor", valueParser: (params) => parseDollarEditorValue(params.newValue),
      valueFormatter: (params) => params.data && isSummary(params.data) ? "—" : usdDollars(Number(params.value ?? 0)),
    },
    { headerName: "Stock", field: "stock", minWidth: 92, editable: (params) => !saving && !isSummary(params.data), cellEditor: "agNumberCellEditor", valueParser: (params) => Number(params.newValue) },
    { headerName: "Reserved", field: "reserved", minWidth: 100, valueFormatter: (params) => params.data && isSummary(params.data) ? String(params.value ?? 0) : String(params.value ?? 0) },
    { headerName: "PayPal Catalog", minWidth: 142, cellRenderer: CatalogStateCell },
    { headerName: "Updated", field: "updatedAt", minWidth: 135, valueFormatter: (params) => params.value ? new Date(String(params.value)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—" },
  ], [saving]);

  function onGridReady(event: GridReadyEvent<GridRow>) {
    apiRef.current = event.api;
    event.api.setGridOption("quickFilterText", quickFilter);
  }

  async function onCellValueChanged(event: CellValueChangedEvent<GridRow>) {
    const row = event.data;
    const fieldName = event.colDef.field;
    if (!row || isSummary(row) || !fieldName) return;

    const field: ProductGridEditField | undefined = fieldName === "listPriceDollars"
      ? "listPriceCents"
      : fieldName === "floorPriceDollars"
        ? "floorPriceCents"
        : fieldName === "stock" ? "stock" : undefined;
    if (!field) return;

    const value = field === "stock" ? Number(event.newValue) : dollarsToCents(String(event.newValue));
    const current = {
      listPriceCents: field === "listPriceCents" ? value : row.listPriceCents,
      floorPriceCents: field === "floorPriceCents" ? value : row.floorPriceCents,
      stock: field === "stock" ? value : row.stock,
      reserved: row.reserved,
    };
    const validation = validateProductGridEdit({ current, field, value });
    if (!validation.ok) {
      event.node.setDataValue(fieldName, event.oldValue);
      setEditError(validation.message);
      return;
    }

    setEditError("");
    setSaving(true);
    try {
      const result = await editProductGridCellAction({ productId: row.id, field, value });
      if (!result.ok) {
        event.node.setDataValue(fieldName, event.oldValue);
        setEditError(result.message);
        toast.error(result.message);
        return;
      }
      const savedAt = new Date().toISOString();
      setRows((currentRows) => currentRows.map((currentRow) => currentRow.id !== row.id ? currentRow : {
        ...currentRow,
        listPriceCents: current.listPriceCents,
        floorPriceCents: current.floorPriceCents,
        listPriceDollars: current.listPriceCents / 100,
        floorPriceDollars: current.floorPriceCents / 100,
        stock: current.stock,
        updatedAt: savedAt,
      }));
      toast.success("Product updated.");
      router.refresh();
    } catch {
      event.node.setDataValue(fieldName, event.oldValue);
      setEditError("The edit could not be saved. Try again.");
      toast.error("The edit could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="products-grid-section" aria-label="Product catalog grid">
    <div className="products-grid-toolbar">
      <label className="products-grid-search"><Search aria-hidden="true" size={15} /><span className="sr-only">Filter products</span><input onChange={(event) => { setQuickFilter(event.target.value); apiRef.current?.setGridOption("quickFilterText", event.target.value); }} placeholder="Filter products…" value={quickFilter} /></label>
      <Button onClick={() => apiRef.current?.exportDataAsCsv({ fileName: "agentshelf-products.csv" })} size="sm" variant="outline"><Download aria-hidden="true" size={14} /> Export CSV</Button>
    </div>
    {editError && <p className="products-grid-edit-error" role="alert">{editError}</p>}
    <div className="products-grid-shell">
      <AgGridReact<GridRow>
        columnDefs={columnDefs}
        defaultColDef={{ resizable: true, sortable: true, filter: true, suppressHeaderMenuButton: false, tooltipValueGetter: (params) => typeof params.value === "string" ? params.value : undefined }}
        getRowId={(params) => params.data.id}
        onCellValueChanged={(event) => void onCellValueChanged(event)}
        onGridReady={onGridReady}
        onRowClicked={(event) => {
          if (!event.data || isSummary(event.data)) return;
          const target = event.event?.target;
          const cell = target instanceof Element ? target.closest<HTMLElement>(".ag-cell") : null;
          if (["listPriceDollars", "floorPriceDollars", "stock"].includes(cell?.getAttribute("col-id") ?? "")) return;
          router.push(`/merchant/products/${event.data.id}`);
        }}
        pinnedBottomRowData={pinnedBottomRowData}
        quickFilterText={quickFilter}
        rowData={rows}
        rowHeight={62}
        theme={themeQuartz.withParams({ accentColor: "#3b2ed0", backgroundColor: "#fffdfa", borderColor: "#e6e1d9", borderRadius: 12, chromeBackgroundColor: "#f4f1ec", fontFamily: "Inter, Arial, sans-serif", fontSize: 12, headerFontSize: 10, headerFontWeight: 650, headerHeight: 42, rowHeight: 62, selectedRowBackgroundColor: "#eeeafc", spacing: 5, wrapperBorderRadius: 14 })}
      />
    </div>
    <p className="products-grid-note">Edit list price, floor price, and stock inline. The floor remains private to your shop.</p>
  </section>;
}
