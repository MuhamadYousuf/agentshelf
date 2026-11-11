"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type ICellRendererParams,
} from "ag-grid-community";
import { ArrowUpRight, Download, ExternalLink, LoaderCircle, PackageCheck, Search, Truck } from "lucide-react";
import { toast } from "sonner";
import { CopilotPanel } from "@/components/merchant/copilot-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { retryMerchantPayout, saveOrderTrackingAction, confirmOrderRefundAction } from "@/app/merchant/(protected)/orders/actions";
import { gridViewToAgGridModel, type GridViewSpec } from "@/lib/merchant/copilot-contracts";
import { aggregatePaidOrderTotals, type PaidOrderTotals } from "@/lib/merchant/order-totals";
import type { MerchantOrderRow } from "@/lib/merchant/orders-feed";
import type { NegotiationMessage, OrderTracking, PricingTraceEntry } from "@/lib/db/schema";

ModuleRegistry.registerModules([AllCommunityModule]);

const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const dateTime = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1_000));
  if (seconds < 60) return "Just now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

function humanize(value: string | null): string {
  if (!value) return "—";
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function TimeCell({ data }: ICellRendererParams<MerchantOrderRow>) {
  return data?.createdAt ? <time dateTime={data.createdAt} title={dateTime(data.createdAt)}>{relativeTime(data.createdAt)}</time> : null;
}

function ProductCell({ data }: ICellRendererParams<MerchantOrderRow>) {
  if (!data) return null;
  if (data.id === "__totals__") return <strong className="orders-total-label">{data.title}</strong>;
  return <span className="orders-product-cell">
    <span className="orders-product-thumb">{data.thumbnailUrl && <Image alt="" fill sizes="38px" src={data.thumbnailUrl} unoptimized />}</span>
    <span className="orders-product-name">{data.title}</span>
  </span>;
}

function ChannelCell({ data }: ICellRendererParams<MerchantOrderRow>) {
  if (!data || data.id === "__totals__") return null;
  return <span className={`orders-channel-cell ${data.channel}`}><Badge className={data.channel === "agent" ? "orders-agent-badge" : "orders-store-badge"} variant="outline">{data.channel === "agent" ? "Agent" : "Storefront"}</Badge><small>{data.channel === "agent" ? data.agentClient : "Online shop"}</small></span>;
}

function DiscountCell({ data }: ICellRendererParams<MerchantOrderRow>) {
  return data ? <span className={`orders-discount ${data.discountPct > 0 ? "has-discount" : ""}`}>{data.discountPct > 0 ? `−${data.discountPct.toFixed(1)}%` : "—"}</span> : null;
}

function AmountCell({ data, value, valueFormatted }: ICellRendererParams<MerchantOrderRow>) {
  if (!data) return null;
  if (data.id === "__totals__") {
    return <span className="orders-total-amount"><strong>{usd(data.amountCents)}</strong>{data.refundedCents ? <small>−{usd(data.refundedCents)} refunded</small> : null}</span>;
  }
  return <span>{valueFormatted ?? usd(Number(value ?? 0))}</span>;
}

function StatusCell({ data }: ICellRendererParams<MerchantOrderRow>) {
  return data ? <Badge className={`orders-status-pill status-${data.status}`} variant="outline">{humanize(data.status)}</Badge> : null;
}

function PayoutCell({ data }: ICellRendererParams<MerchantOrderRow>) {
  if (!data || data.flow !== "agent_pass") return <span className="orders-muted">—</span>;
  const status = data.payoutStatus ?? "pending";
  return <Badge className={`orders-payout-pill payout-${status.toLowerCase()}`} variant="outline">{humanize(status)}</Badge>;
}

function TrackingCell({ data }: ICellRendererParams<MerchantOrderRow>) {
  if (!data?.tracking?.trackingNumber) return <span className="orders-muted">Not added</span>;
  return data.tracking.url
    ? <a className="orders-tracking-link" href={data.tracking.url} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank">{data.tracking.carrier} · {data.tracking.trackingNumber}<ExternalLink aria-hidden="true" size={12} /></a>
    : <span className="orders-tracking-link">{data.tracking.carrier} · {data.tracking.trackingNumber}</span>;
}

function gridViewLabels(view: GridViewSpec): string[] {
  const labels: string[] = [];
  const filters = view.filters;
  if (filters?.channel) labels.push(filters.channel === "agent" ? "Agent" : "Storefront");
  if (filters?.flow) labels.push(filters.flow === "agent_pass" ? "Agent Pass" : "PayPal link");
  if (filters?.status) labels.push(humanize(filters.status));
  if (filters?.amount) {
    const minimum = filters.amount.min;
    const maximum = filters.amount.max;
    if (minimum !== undefined && maximum !== undefined) labels.push(`${usd(minimum)}–${usd(maximum)}`);
    else if (minimum !== undefined) labels.push(`≥ ${usd(minimum)}`);
    else if (maximum !== undefined) labels.push(`≤ ${usd(maximum)}`);
  }
  if (filters?.agent_client) labels.push(filters.agent_client);
  if (view.quick_filter) labels.push(`“${view.quick_filter}”`);
  if (view.sort) labels.push(`Sorted by ${view.sort.columnId} ${view.sort.direction === "desc" ? "high to low" : "low to high"}`);
  return labels.length > 0 ? labels : ["Custom view"];
}

type OrderDetail = {
  id: string;
  createdAt: string;
  updatedAt: string;
  qty: number;
  amountCents: number;
  flow: "approval_link" | "agent_pass";
  agentClient: string;
  status: string;
  captureId: string | null;
  paypalOrderId: string | null;
  payoutBatchId: string | null;
  payoutStatus: string | null;
  isDemo: boolean;
  tracking: OrderTracking | null;
  shippingCity: string | null;
  shippingCountry: string | null;
  product: { id: string; title: string; listPriceCents: number; thumbnailUrl: string | null };
  negotiation: { id: string; clientName: string; round: number; messages: NegotiationMessage[]; trace: PricingTraceEntry[] } | null;
};

function OrderDetails({ orderId, onChanged }: { orderId: string; onChanged: () => void }) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTracking, setShowTracking] = useState(false);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [carrier, setCarrier] = useState("UPS");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);

  const fetchDetail = useCallback(async (): Promise<OrderDetail | null> => {
    const response = await fetch(`/api/merchant/orders/${orderId}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Order details could not be loaded.");
    const payload = await response.json() as { order?: OrderDetail };
    return payload.order ?? null;
  }, [orderId]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await fetchDetail());
    } catch {
      setDetail(null);
      toast.error("Order details could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [fetchDetail]);

  useEffect(() => {
    let active = true;
    void fetchDetail().then((order) => { if (active) setDetail(order); }).catch(() => {
      if (active) { setDetail(null); toast.error("Order details could not be loaded."); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchDetail]);

  async function addTracking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !/^[A-Z0-9-]{6,40}$/i.test(trackingNumber.trim())) {
      toast.error("Enter a tracking number with 6–40 letters, numbers, or hyphens.");
      return;
    }
    const normalized = trackingNumber.trim().toUpperCase();
    if (!window.confirm(`Add ${carrier} tracking ${normalized} to this order?`)) return;
    setTrackingBusy(true);
    try {
      const result = await saveOrderTrackingAction({ orderId: detail.id, carrier: carrier as "UPS" | "USPS" | "FEDEX" | "DHL" | "OTHER", trackingNumber: normalized });
      if (!result.success) { toast.error(result.message); return; }
      toast.success(result.message);
      setShowTracking(false);
      setTrackingNumber("");
      await loadDetail();
      onChanged();
    } catch {
      toast.error("Tracking could not be saved. Try again.");
    } finally {
      setTrackingBusy(false);
    }
  }

  async function refundOrder() {
    if (!detail || refundBusy || !window.confirm(`Refund ${usd(detail.amountCents)} for ${detail.product.title}? PayPal will return this payment to the buyer.`)) return;
    setRefundBusy(true);
    try {
      const result = await confirmOrderRefundAction({ orderId: detail.id, reason: "Merchant confirmed refund from the order drawer" });
      if (!result.success) { toast.error(result.message); return; }
      toast.success(result.message);
      await loadDetail();
      onChanged();
    } catch {
      toast.error("PayPal could not complete this refund. Review the order and try again.");
    } finally {
      setRefundBusy(false);
    }
  }

  async function retryPayout(formData: FormData) {
    const result = await retryMerchantPayout(formData);
    if (!result.success) {
      toast.error(result.message);
      return;
    }
    await loadDetail();
    onChanged();
    toast.success(result.message);
  }

  if (loading) return <div className="order-detail-loading"><LoaderCircle className="copilot-spin" size={18} /> Loading order details…</div>;
  if (!detail) return <p className="order-detail-error">This order could not be found in your shop.</p>;
  const latestTrace = detail.negotiation?.trace.at(-1);

  return <div className="order-detail-content">
    <section className="order-detail-summary">
      <div className="order-detail-product">
        <span className="order-detail-thumb">{detail.product.thumbnailUrl && <Image alt="" fill sizes="58px" src={detail.product.thumbnailUrl} unoptimized />}</span>
        <span><strong>{detail.product.title}{detail.isDemo && <Badge className="demo-history-badge" variant="outline">Demo history</Badge>}</strong><small>{detail.qty} item{detail.qty === 1 ? "" : "s"} · {dateTime(detail.createdAt)}</small></span>
      </div>
      <div className="order-detail-total"><span>Order total</span><strong>{usd(detail.amountCents)}</strong></div>
      <div className="order-detail-facts">
        <div><span>Status</span><Badge className={`orders-status-pill status-${detail.status}`} variant="outline">{humanize(detail.status)}</Badge></div>
        <div><span>Channel</span><strong>{detail.flow === "agent_pass" ? "Agent Pass" : detail.agentClient === "Storefront" ? "Storefront" : "Agent · PayPal link"}</strong></div>
        <div><span>Delivery</span><strong>{[detail.shippingCity, detail.shippingCountry].filter(Boolean).join(", ") || "Shipping details unavailable"}</strong></div>
        {detail.tracking?.trackingNumber && <div><span>Tracking</span><strong>{detail.tracking.carrier} · {detail.tracking.trackingNumber}</strong></div>}
      </div>
    </section>

    {detail.negotiation && <section className="order-detail-section">
      <div className="order-detail-section-title"><h3>Negotiation</h3><span>{detail.negotiation.round} rounds</span></div>
      {latestTrace && <div className="order-price-reason"><span>Why this price</span><strong>{usd(latestTrace.chosen)}</strong><small>{latestTrace.reason.replaceAll("→", " → ").replaceAll("_", " ")}</small><Link href={`/merchant/negotiations/${detail.negotiation.id}`}>Open full negotiation <ArrowUpRight aria-hidden="true" size={13} /></Link></div>}
      <div className="order-transcript">{detail.negotiation.messages.map((message, index) => <div className={`order-transcript-row ${message.role}`} key={`${message.at}-${index}`}><span>{message.role === "buyer" ? detail.negotiation?.clientName ?? "Buyer" : message.role === "merchant" ? "Shop" : "System"}</span><p>{message.text}</p>{message.offerCents !== undefined && <strong>{usd(message.offerCents)}</strong>}</div>)}</div>
    </section>}

    <section className="order-detail-section order-paypal-ids"><h3>PayPal</h3><div><span>PayPal order</span><code>{detail.paypalOrderId ?? "—"}</code></div><div><span>Capture</span><code>{detail.captureId ?? "—"}</code></div><div><span>Payout batch</span><code>{detail.payoutBatchId ?? "—"}</code></div></section>

    {detail.status === "completed" && <section className="order-detail-actions">
      {!showTracking && <Button onClick={() => setShowTracking(true)} size="sm" variant="outline"><Truck aria-hidden="true" size={14} /> {detail.tracking?.trackingNumber ? "Update tracking" : "Add tracking"}</Button>}
      {showTracking && <form className="order-tracking-form" onSubmit={(event) => void addTracking(event)}>
        <label>Carrier<select onChange={(event) => setCarrier(event.target.value)} value={carrier}><option value="UPS">UPS</option><option value="USPS">USPS</option><option value="FEDEX">FedEx</option><option value="DHL">DHL</option><option value="OTHER">Other</option></select></label>
        <label>Tracking number<input autoComplete="off" maxLength={40} onChange={(event) => setTrackingNumber(event.target.value.toUpperCase())} placeholder="1Z…" value={trackingNumber} /></label>
        <div className="order-tracking-buttons"><Button disabled={trackingBusy} size="sm" type="submit">{trackingBusy ? "Saving…" : "Save tracking"}</Button><Button onClick={() => setShowTracking(false)} size="sm" type="button" variant="ghost">Cancel</Button></div>
      </form>}
      {detail.flow === "agent_pass" && detail.status === "completed" && <Button disabled={refundBusy} onClick={() => void refundOrder()} size="sm" variant="outline">{refundBusy ? "Refunding…" : "Refund"}</Button>}
      {detail.flow === "agent_pass" && detail.payoutStatus?.toUpperCase() === "FAILED" && <form action={retryPayout}><input name="orderId" type="hidden" value={detail.id} /><Button size="sm" variant="outline"><PackageCheck aria-hidden="true" size={14} /> Retry payout</Button></form>}
    </section>}
  </div>;
}

export function OrdersGrid({ initialRows, initialCursor }: { initialRows: MerchantOrderRow[]; initialCursor: string }) {
  const apiRef = useRef<GridApi<MerchantOrderRow> | null>(null);
  const rowsRef = useRef(initialRows);
  const cursorRef = useRef(initialCursor);
  const pollingRef = useRef(false);
  const [rows, setRows] = useState(initialRows);
  const [paidTotals, setPaidTotals] = useState<PaidOrderTotals>(() => aggregatePaidOrderTotals(initialRows));
  const [quickFilter, setQuickFilter] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [copilotView, setCopilotView] = useState<GridViewSpec | null>(null);
  const [highlightGrid, setHighlightGrid] = useState(false);
  const highlightTimer = useRef<number | null>(null);

  const refreshVisibleTotals = useCallback(() => {
    const visibleRows: MerchantOrderRow[] = [];
    const api = apiRef.current;
    if (api) {
      api.forEachNodeAfterFilter((node) => {
        if (node.data && node.data.id !== "__totals__") visibleRows.push(node.data);
      });
    } else {
      visibleRows.push(...rowsRef.current);
    }
    const nextTotals = aggregatePaidOrderTotals(visibleRows);
    setPaidTotals((current) => current.paidOrderCount === nextTotals.paidOrderCount
      && current.paidCents === nextTotals.paidCents
      && current.refundedCents === nextTotals.refundedCents
      ? current
      : nextTotals);
  }, []);

  const pulseGrid = useCallback(() => {
    setHighlightGrid(false);
    window.requestAnimationFrame(() => setHighlightGrid(true));
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightGrid(false), 1_350);
  }, []);

  useEffect(() => () => {
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
  }, []);

  const refreshFeed = useCallback(async () => {
    if (pollingRef.current || document.visibilityState !== "visible") return;
    pollingRef.current = true;
    try {
      const response = await fetch(`/api/merchant/orders?since=${encodeURIComponent(cursorRef.current)}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { orders?: MerchantOrderRow[]; nextSince?: string };
      if (typeof payload.nextSince === "string") cursorRef.current = payload.nextSince;
      const incoming = payload.orders ?? [];
      if (incoming.length === 0) return;
      const current = rowsRef.current;
      const existing = new Map(current.map((row) => [row.id, row]));
      const add = incoming.filter((row) => !existing.has(row.id));
      const update = incoming.filter((row) => {
        const prior = existing.get(row.id);
        return prior !== undefined && prior.updatedAt !== row.updatedAt;
      });
      const next = [...incoming, ...current.filter((row) => !incoming.some((changed) => changed.id === row.id))]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      rowsRef.current = next;
      setRows(next);
      const api = apiRef.current;
      if (api) api.applyTransactionAsync({ add, update, addIndex: 0 }, () => {
        const changedNodes = [...add, ...update].flatMap((row) => {
          const node = api.getRowNode(row.id);
          return node ? [node] : [];
        });
        if (changedNodes.length > 0) api.flashCells({ rowNodes: changedNodes });
      });
      for (const row of add) toast(`New order from ${row.agentClient} · ${usd(row.amountCents)}`, { icon: <span aria-hidden="true">✦</span> });
    } catch {
      // A missed poll is recovered by the next cursor-based update.
    } finally {
      pollingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => { void refreshFeed(); }, 5_000);
    return () => window.clearInterval(timer);
  }, [refreshFeed]);

  useEffect(() => {
    const api = apiRef.current;
    if (api) {
      api.setGridOption("quickFilterText", quickFilter);
      refreshVisibleTotals();
    }
  }, [quickFilter, refreshVisibleTotals]);

  const columnDefs = useMemo<ColDef<MerchantOrderRow>[]>(() => [
    { headerName: "Time", field: "createdAt", colId: "createdAt", width: 114, minWidth: 102, filter: "agDateColumnFilter", filterParams: { comparator: (filterDate: Date, cellValue: string) => { const localDate = cellValue.slice(0, 10).split("-").map(Number); const cellDate = new Date(localDate[0], (localDate[1] ?? 1) - 1, localDate[2] ?? 1); return cellDate.getTime() < filterDate.getTime() ? -1 : cellDate.getTime() > filterDate.getTime() ? 1 : 0; } }, cellRenderer: TimeCell, tooltipValueGetter: (params) => params.data?.createdAt ? dateTime(params.data.createdAt) : undefined, sortable: true },
    { headerName: "Product", field: "title", colId: "title", minWidth: 210, flex: 1.1, filter: "agTextColumnFilter", cellRenderer: ProductCell },
    { headerName: "Channel", field: "channel", colId: "channel", width: 152, filter: "agTextColumnFilter", getQuickFilterText: (params) => `${params.data?.channel ?? ""} ${params.data?.agentClient ?? ""}`, cellRenderer: ChannelCell },
    { headerName: "Agent client", field: "agentClient", colId: "agentClient", hide: true, filter: "agTextColumnFilter", sortable: false },
    { headerName: "Amount", field: "amountCents", colId: "amountCents", width: 156, minWidth: 144, filter: "agNumberColumnFilter", filterValueGetter: (params) => params.data ? params.data.amountCents / 100 : 0, valueFormatter: (params) => params.value === null || params.value === undefined ? "—" : usd(Number(params.value)), cellClass: "orders-amount-cell", cellRenderer: AmountCell },
    { headerName: "Discount", field: "discountPct", colId: "discountPct", width: 106, filter: "agNumberColumnFilter", valueFormatter: (params) => Number(params.value) > 0 ? `${Number(params.value).toFixed(1)}%` : "—", cellRenderer: DiscountCell },
    { headerName: "Flow", field: "flow", colId: "flow", width: 119, filter: "agTextColumnFilter", valueFormatter: (params) => params.data?.id === "__totals__" ? "—" : params.value === "agent_pass" ? "Agent Pass" : "PayPal link" },
    { headerName: "Status", field: "status", colId: "status", width: 136, filter: "agTextColumnFilter", cellRenderer: StatusCell },
    { headerName: "Payout", field: "payoutStatus", colId: "payoutStatus", width: 116, filter: "agTextColumnFilter", cellRenderer: PayoutCell },
    { headerName: "Tracking", field: "tracking", colId: "tracking", minWidth: 175, width: 190, sortable: false, filter: false, cellDataType: false, cellRenderer: TrackingCell },
    { headerName: "", colId: "actions", width: 92, minWidth: 92, sortable: false, filter: false, cellRenderer: () => <span className="orders-open-action">Details <ArrowUpRight aria-hidden="true" size={13} /></span> },
  ], []);

  const totalsRow = useMemo<MerchantOrderRow>(() => ({
    id: "__totals__", createdAt: "", updatedAt: "", title: `Paid · ${paidTotals.paidOrderCount} ${paidTotals.paidOrderCount === 1 ? "order" : "orders"}`, thumbnailUrl: null,
    qty: paidTotals.paidOrderCount, amountCents: paidTotals.paidCents, refundedCents: paidTotals.refundedCents,
    listPriceCents: 0, discountPct: 0, channel: "storefront", agentClient: "", flow: "approval_link", status: "", payoutStatus: null, isDemo: false,
    captureId: null, tracking: null, negotiationId: null, rounds: 0, shippingCity: null, shippingCountry: null,
  }), [paidTotals]);

  function onGridReady(event: GridReadyEvent<MerchantOrderRow>) { apiRef.current = event.api; event.api.setGridOption("quickFilterText", quickFilter); refreshVisibleTotals(); }
  function applyGridView(view: GridViewSpec) {
    const api = apiRef.current;
    if (!api) return;
    const model = gridViewToAgGridModel(view);
    api.setFilterModel(model.filterModel);
    api.applyColumnState({ state: model.columnState, defaultState: { sort: null } });
    setQuickFilter(model.quickFilterText);
    api.setGridOption("quickFilterText", model.quickFilterText);
    setCopilotView(view);
    refreshVisibleTotals();
    pulseGrid();
    toast.success("Orders view updated.");
  }

  function clearCopilotView() {
    const api = apiRef.current;
    if (api) {
      api.setFilterModel(null);
      api.resetColumnState();
      api.setGridOption("quickFilterText", "");
    }
    setQuickFilter("");
    setCopilotView(null);
    refreshVisibleTotals();
    pulseGrid();
  }

  function openOrder(id: string | null | undefined) { if (id && id !== "__totals__") setSelectedOrderId(id); }
  function changedOrder() { void refreshFeed(); }

  return <div className="merchant-orders-page">
    <div className="listing-review-head orders-page-heading">
      <div><h1 className="merchant-page-title">Orders</h1><p className="merchant-page-subtitle">Every storefront and agent sale, in one live view.</p></div>
      <CopilotPanel onGridView={applyGridView} onOrderChanged={changedOrder} />
    </div>
    <section aria-label="Order tools" className="orders-toolbar">
      <label className="orders-search"><Search aria-hidden="true" size={16} /><span className="sr-only">Search all orders</span><input onChange={(event) => setQuickFilter(event.target.value)} placeholder="Search orders, products, agents…" value={quickFilter} /></label>
      <div className="orders-toolbar-actions"><span className="orders-live-indicator"><i aria-hidden="true" /> Live · 5 sec</span><Button onClick={() => apiRef.current?.exportDataAsCsv({ fileName: "agentshelf-orders.csv" })} size="sm" variant="outline"><Download aria-hidden="true" size={14} /> Export CSV</Button></div>
    </section>
    {copilotView && <div aria-label="Copilot filters" className="orders-copilot-filter">
      <span>Filtered by Copilot</span>
      {gridViewLabels(copilotView).map((label) => <strong key={label}>{label}</strong>)}
      <Button onClick={clearCopilotView} size="sm" variant="ghost">Clear</Button>
    </div>}
    {rows.length === 0 ? (
      <section className="orders-empty-state" aria-labelledby="orders-empty-title">
        <h2 id="orders-empty-title">No orders yet</h2>
        <p>Completed storefront and agent purchases will appear here, with payment and delivery details.</p>
        <Link href="/merchant/products">Review your published products <ArrowUpRight aria-hidden="true" size={14} /></Link>
      </section>
    ) : <div className={`orders-grid-shell${highlightGrid ? " is-copilot-highlight" : ""}`}>
      <AgGridReact<MerchantOrderRow>
        animateRows
        columnDefs={columnDefs}
        defaultColDef={{ resizable: true, sortable: true, filter: true, suppressHeaderMenuButton: false, enableCellChangeFlash: true, tooltipValueGetter: (params) => typeof params.value === "string" ? params.value : undefined }}
        getRowId={(params) => params.data.id}
        onFilterChanged={refreshVisibleTotals}
        onGridReady={onGridReady}
        onModelUpdated={refreshVisibleTotals}
        onRowClicked={(event) => openOrder(event.data?.id)}
        pagination
        paginationPageSize={25}
        paginationPageSizeSelector={false}
        pinnedBottomRowData={[totalsRow]}
        rowData={rows}
        rowHeight={72}
        theme={themeQuartz.withParams({ accentColor: "#3b2ed0", backgroundColor: "#fffdfa", borderColor: "#e6e1d9", borderRadius: 12, chromeBackgroundColor: "#f4f1ec", fontFamily: "Inter, Arial, sans-serif", fontSize: 12, headerFontSize: 10, headerFontWeight: 650, headerHeight: 42, rowHeight: 72, selectedRowBackgroundColor: "#eeeafc", spacing: 5, wrapperBorderRadius: 14 })}
      />
    </div>}
    {rows.length > 0 && <p className="orders-grid-footnote">Select a row for the order history, fulfillment actions, and pricing context.</p>}

    <Sheet onOpenChange={(open) => { if (!open) setSelectedOrderId(null); }} open={selectedOrderId !== null}>
      <SheetContent className="order-detail-sheet w-[min(96vw,620px)] sm:max-w-[620px]" side="right">
        <SheetHeader className="order-detail-header">
          <SheetTitle>Order details</SheetTitle>
          <SheetDescription>Merchant-only order and fulfillment view</SheetDescription>
        </SheetHeader>
        {selectedOrderId && <OrderDetails key={selectedOrderId} onChanged={changedOrder} orderId={selectedOrderId} />}
      </SheetContent>
    </Sheet>
  </div>;
}
