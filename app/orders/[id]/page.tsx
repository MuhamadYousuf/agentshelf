import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Check, Clock3, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { merchants, orders, products } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "Order receipt",
  robots: { index: false, follow: false },
};

type ReceiptProps = { params: Promise<{ id: string }> };

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

async function ReceiptContent({ params }: ReceiptProps) {
  const { id } = await params;
  const [order] = await getDb().select({
    id: orders.id,
    status: orders.status,
    buyerNote: orders.buyerNote,
    amountCents: orders.amountCents,
    qty: orders.qty,
    captureId: orders.captureId,
    shipping: orders.shipping,
    shopName: merchants.name,
    shopSlug: merchants.slug,
    productTitle: products.title,
  }).from(orders).innerJoin(merchants, eq(orders.merchantId, merchants.id))
    .innerJoin(products, eq(orders.productId, products.id))
    .where(eq(orders.id, id)).limit(1);
  if (!order) notFound();

  const cancelled = order.status === "failed" && order.buyerNote === "cancelled";
  const completed = order.status === "completed";
  const refunded = order.status === "refunded";
  const heading = completed ? "Payment complete" : refunded ? "Payment refunded" : cancelled ? "Checkout cancelled" :
    order.status === "approval_required" || order.status === "approved" ? "Payment awaiting approval" : "Order update";
  const statusLabel = completed ? "Completed" : refunded ? "Refunded" : cancelled ? "Cancelled" :
    order.status === "approval_required" || order.status === "approved" ? "Approval pending" : "Payment not completed";

  return (
    <>
      <header className="storefront-header">
        <div className="page-wrap storefront-header-inner">
          <Logo />
          <Link className="product-back-link" href={`/s/${order.shopSlug}`}><ArrowLeft aria-hidden="true" size={15} /> Back to {order.shopName}</Link>
        </div>
      </header>
      <main className="page-wrap receipt-page">
        <div className={`receipt-state-icon ${completed ? "complete" : cancelled ? "cancelled" : "pending"}`}>
          {completed ? <Check aria-hidden="true" size={26} /> : cancelled ? <X aria-hidden="true" size={26} /> : <Clock3 aria-hidden="true" size={26} />}
        </div>
        <h1 className="receipt-title">{heading}</h1>
        <p className="receipt-shop">{order.shopName}</p>
        <div className="receipt-status"><Badge variant="outline">{statusLabel}</Badge></div>

        <section aria-label="Order summary" className="receipt-summary">
          <div className="receipt-item-line"><span>{order.productTitle}</span><span>× {order.qty}</span></div>
          <div className="receipt-total-line"><span>Total</span><strong>{formatPrice(order.amountCents)}</strong></div>
        </section>

        {completed && order.captureId && (
          <section className="receipt-payment-details">
            <p><span>PayPal capture</span><code>{order.captureId}</code></p>
            {order.shipping && (
              <p><span>Shipping to</span><strong>{order.shipping.name ?? "Buyer"}{order.shipping.address.city ? ` · ${order.shipping.address.city}` : ""}</strong></p>
            )}
            <p className="receipt-paid-directly">Paid directly to {order.shopName} via PayPal.</p>
          </section>
        )}
        {order.status === "approval_required" && (
          <p className="receipt-pending-note">Your order is reserved while PayPal confirms approval. This page will update after the payment is captured.</p>
        )}
        <Button asChild className="receipt-back-button" variant="outline"><Link href={`/s/${order.shopSlug}`}>Return to shop</Link></Button>
      </main>
    </>
  );
}

function ReceiptFallback() {
  return <main aria-busy="true" className="page-wrap receipt-page"><div className="mx-auto h-14 w-14 animate-pulse rounded-full bg-muted" /><div className="mx-auto mt-6 h-10 w-2/3 animate-pulse rounded bg-muted" /><div className="mt-8 h-40 animate-pulse rounded-xl bg-muted" /></main>;
}

export default function OrderReceiptPage({ params }: ReceiptProps) {
  return <Suspense fallback={<ReceiptFallback />}><ReceiptContent params={params} /></Suspense>;
}
