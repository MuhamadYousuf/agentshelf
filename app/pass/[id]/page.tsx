import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { ArrowLeft, Clock3, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";
import { PassTokenPanel } from "@/components/pass/pass-token-panel";
import { PassCountdown } from "@/components/pass/countdown";
import { formatCategory } from "@/lib/commerce/categories";
import { getAppUrl } from "@/lib/env";
import { getDb } from "@/lib/db";
import { buyerPasses, events, orders, products } from "@/lib/db/schema";
import { isPassOwner } from "@/lib/passes/owner";
import { deletePaymentToken } from "@/lib/paypal/vault";
import { revokeAgentPass } from "./actions";

export const metadata: Metadata = { title: "Your Agent Pass" };

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

type AgentPassPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; error?: string }>;
};

export default function AgentPassPage(props: AgentPassPageProps) {
  return (
    <Suspense fallback={<PassDetailFallback />}>
      <AgentPassContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

function PassDetailFallback() {
  return (
    <main aria-busy="true" className="pass-detail-shell">
      <div className="pass-detail-topline"><span className="pass-wordmark"><span className="pass-mark"><WalletCards size={17} /></span> AgentShelf</span></div>
      <div className="pass-detail-wrap"><div className="pass-detail-loading">Loading your Agent Pass…</div></div>
    </main>
  );
}

async function AgentPassContent({ params, searchParams }: AgentPassPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [pass] = await getDb().select().from(buyerPasses).where(eq(buyerPasses.id, id)).limit(1);
  if (!pass || !(await isPassOwner(pass.id, pass.ownerKeyHash))) notFound();

  let status = pass.status;
  const [expiredPass] = status === "active" ? await getDb().update(buyerPasses).set({ status: "expired", updatedAt: new Date() })
    .where(and(
      eq(buyerPasses.id, pass.id),
      eq(buyerPasses.status, "active"),
      sql`(${buyerPasses.mandate} ->> 'expiresAt')::timestamptz <= now()`,
    )).returning({ id: buyerPasses.id }) : [];
  if (expiredPass) {
    if (pass.vaultId) {
      await deletePaymentToken({ requestId: `pass-expire-${pass.id}`, vaultId: pass.vaultId }).catch(() => undefined);
    }
    await getDb().insert(events).values({ type: "pass.expired", source: "system", payload: { passId: pass.id } })
      .catch(() => undefined);
    status = "expired";
  }

  const [orderSummary] = await getDb().select({ total: count() }).from(orders).where(eq(orders.passId, pass.id));
  const passOrders = await getDb().select({
    id: orders.id,
    createdAt: orders.createdAt,
    amountCents: orders.amountCents,
    qty: orders.qty,
    status: orders.status,
    payoutStatus: orders.payoutStatus,
    title: products.title,
  }).from(orders).innerJoin(products, eq(orders.productId, products.id))
    .where(eq(orders.passId, pass.id)).orderBy(desc(orders.createdAt)).limit(12);
  const totalBudget = pass.mandate.totalBudgetCents;
  const reserved = pass.pendingCents;
  const spent = pass.spentCents;
  const remaining = Math.max(0, totalBudget - spent - reserved);
  const usedPercent = totalBudget > 0 ? Math.min(100, Math.round(((spent + reserved) / totalBudget) * 100)) : 0;
  const endpoint = `${getAppUrl().replace(/\/+$/, "")}/api/mcp`;
  const errorMessage = query.error === "approval"
    ? "PayPal did not complete the vault approval. Your pass is not active. Try creating a new pass."
    : query.error === "already-claimed"
      ? "This pass was activated in another request. If the key was not saved, revoke this pass and create another."
      : null;

  return (
    <main className="pass-detail-shell">
      <div className="pass-detail-topline">
        <Link className="pass-back-link" href="/pass"><ArrowLeft size={16} /> Create another pass</Link>
        <span className="pass-wordmark"><span className="pass-mark"><WalletCards size={17} /></span> AgentShelf</span>
      </div>

      <div className="pass-detail-wrap">
        <div className="pass-detail-title-row">
          <div>
            <h1>{pass.label}</h1>
            <p>Created {pass.createdAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
          </div>
          <Badge className={`pass-status-badge pass-status-${status}`} variant="outline">{status.replaceAll("_", " ")}</Badge>
        </div>

        {errorMessage ? <p className="pass-detail-alert" role="status">{errorMessage}</p> : null}
        {query.created === "1" && status === "active" ? <PassTokenPanel passId={pass.id} endpoint={endpoint} /> : null}

        <div className="pass-detail-grid">
          <section className="pass-detail-card pass-budget-card">
            <div className="pass-detail-card-head"><div className="pass-form-icon"><ShieldCheck size={19} /></div><div><h2>Budget progress</h2></div></div>
            <div className="pass-budget-numbers"><strong>{money(spent + reserved)}</strong><span>of {money(totalBudget)}</span></div>
            <div className="pass-budget-track" role="progressbar" aria-valuemin={0} aria-valuemax={totalBudget} aria-valuenow={spent + reserved}>
              <span style={{ width: `${usedPercent}%` }} />
            </div>
            <div className="pass-budget-legend"><span><i className="spent-dot" />Spent {money(spent)}</span><span><i className="pending-dot" />In progress {money(reserved)}</span></div>
            <div className="pass-budget-remaining"><span>Available budget</span><strong>{money(remaining)}</strong></div>
            <div className="pass-mandate-list">
              <div><span>Per-order limit</span><strong>{money(pass.mandate.perOrderMaxCents)}</strong></div>
              <div><span>PayPal step-up above</span><strong>{money(pass.mandate.stepUpOverCents)}</strong></div>
              <div><span>Eligible categories</span><strong>{pass.mandate.categories.map(formatCategory).join(", ")}</strong></div>
            </div>
          </section>

          <section className="pass-detail-card pass-lifecycle-card">
            <div className="pass-detail-card-head"><div className="pass-form-icon pass-clock-icon"><Clock3 size={19} /></div><div><h2>Pass details</h2></div></div>
            <div className="pass-lifecycle-list">
              <div><span>Expires</span><strong><PassCountdown expiresAt={pass.mandate.expiresAt} /></strong></div>
              <div><span>Expiry date</span><strong>{new Date(pass.mandate.expiresAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</strong></div>
              <div><span>Orders</span><strong>{orderSummary?.total ?? 0}</strong></div>
              <div><span>Payment method</span><strong>{pass.payerEmail ? `PayPal · ${pass.payerEmail}` : "PayPal wallet"}</strong></div>
              <div><span>Pass key storage</span><strong>Hash only</strong></div>
            </div>
            <div className="pass-privacy-callout"><LockKeyhole size={16} /><span>Your full pass key is shown once after approval. AgentShelf stores only its hash.</span></div>
            {status === "active" || status === "pending_vault" ? (
              <form action={revokeAgentPass.bind(null, pass.id)}>
                <Button className="pass-revoke-button" type="submit" variant="outline">Revoke this pass</Button>
              </form>
            ) : null}
          </section>
        </div>

        <section className="pass-orders-section" aria-labelledby="pass-orders-title">
          <div className="pass-orders-heading"><h2 id="pass-orders-title">Orders made with this pass</h2><span>{orderSummary?.total ?? 0} total</span></div>
          {passOrders.length > 0 ? (
            <ul className="pass-orders-list">
              {passOrders.map((order) => (
                <li key={order.id}>
                  <div><strong>{order.title}</strong><span>{order.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {order.qty} {order.qty === 1 ? "item" : "items"}</span></div>
                  <div className="pass-order-result"><strong>{money(order.amountCents)}</strong><Badge variant="outline">{order.status.replaceAll("_", " ")}</Badge><Link href={`/orders/${order.id}`}>Receipt</Link></div>
                </li>
              ))}
            </ul>
          ) : <p className="pass-orders-empty">No purchases yet. Your agent’s orders will appear here.</p>}
        </section>

        <p className="pass-detail-footnote">Listed prices include shipping. Revoke access here at any time; PayPal token deletion is requested in the background.</p>
      </div>
    </main>
  );
}
