import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft, Bot, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { requireMerchant } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { negotiations, products, quotes } from "@/lib/db/schema";
import { formatCategory } from "@/lib/commerce/categories";
import { PRICING_PARAMS } from "@/lib/commerce/pricing-brain";
import { formatCents } from "@/lib/mcp/public";

function reasonInEnglish(reason: string): string {
  const reasons: Record<string, string> = {
    "walk_away→recovery": "The buyer stepped away, so the pricing brain moved into recovery and chose a more inviting next offer.",
    "reciprocal_counter→cooperate": "The buyer raised their previous counter. The pricing brain recognized that as cooperation.",
    "counter≥offer→accept": "The buyer's counter met or exceeded the selected offer, so it was accepted within shop policy.",
    expected_utility_maximum: "This candidate had the strongest expected return across the current offer grid.",
    "below_floor→final": "The buyer's counter was below the allowed policy range, so the pricing brain held to its final offer.",
    "round_cap→final": "The negotiation reached its round limit, so the pricing brain returned a final offer.",
    buyer_accepts_offer: "The buyer accepted the current shop offer.",
    auto_accept_disabled: "Automatic acceptance is disabled for this shop, so the counter was answered with a new offer.",
  };
  return reasons[reason] ?? "The pricing brain selected this move from the current buyer behavior and expected utility.";
}

function utilityCurrency(cents: number): string {
  return formatCents(cents);
}

function PriceTrace({ trace, round }: {
  trace: {
    belief: number;
    state: "cooperate" | "recovery";
    candidates: Array<{ priceCents: number; pAccept: number; eu: number }>;
    chosen: number;
    reason: string;
  };
  round: number;
}) {
  const utilities = trace.candidates.map((candidate) => candidate.eu);
  const low = Math.min(...utilities);
  const high = Math.max(...utilities);
  const spread = high - low;

  return (
    <section aria-labelledby={`trace-round-${round}`} className="negotiation-trace-round">
      <div className="negotiation-trace-round-head">
        <h3 id={`trace-round-${round}`}>Round {round}</h3>
        <Badge className={`negotiation-state-badge ${trace.state}`} variant="outline">
          {trace.state === "cooperate" ? "Cooperate" : "Recovery"}
        </Badge>
      </div>
      <div className="belief-meter">
        <div className="belief-meter-label">
          <span>Price-sensitive buyer belief</span>
          <strong>{Math.round(trace.belief * 100)}%</strong>
        </div>
        <div aria-label={`${Math.round(trace.belief * 100)} percent probability that this buyer is price-sensitive`} className="belief-meter-track" role="img">
          <span style={{ width: `${Math.min(100, Math.max(0, trace.belief * 100))}%` }} />
        </div>
      </div>
      <div aria-label={`Candidate offer prices and expected utility for round ${round}`} className="trace-chart" role="img">
        {trace.candidates.map((candidate) => {
          const height = spread <= 0 ? 62 : 18 + ((candidate.eu - low) / spread) * 74;
          const chosen = candidate.priceCents === trace.chosen;
          return (
            <div className={`trace-chart-column${chosen ? " chosen" : ""}`} key={`${round}-${candidate.priceCents}`}>
              <span className="trace-chart-utility">{utilityCurrency(candidate.eu)}</span>
              <span className="trace-chart-bar-track"><span style={{ height: `${height}%` }} /></span>
              <span className="trace-chart-price">{formatCents(candidate.priceCents)}</span>
              <span className="trace-chart-probability">{Math.round(candidate.pAccept * 100)}% accept</span>
            </div>
          );
        })}
      </div>
      <p className="trace-reason"><strong>Why:</strong> {reasonInEnglish(trace.reason)}</p>
    </section>
  );
}

export default async function MerchantNegotiationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const merchant = await requireMerchant();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const [row] = await getDb().select({
    id: negotiations.id,
    clientName: negotiations.clientName,
    messages: negotiations.messages,
    status: negotiations.status,
    state: negotiations.state,
    belief: negotiations.belief,
    round: negotiations.round,
    lastOfferCents: negotiations.lastOfferCents,
    trace: negotiations.trace,
    createdAt: negotiations.createdAt,
    updatedAt: negotiations.updatedAt,
    productId: products.id,
    productTitle: products.title,
    productCategory: products.category,
  }).from(negotiations)
    .innerJoin(products, eq(negotiations.productId, products.id))
    .where(and(
      eq(negotiations.id, id),
      eq(negotiations.merchantId, merchant.id),
      eq(products.merchantId, merchant.id),
    ))
    .limit(1);
  if (!row) notFound();

  const latestQuote = await getDb().select({ qty: quotes.qty }).from(quotes)
    .where(eq(quotes.negotiationId, row.id))
    .orderBy(desc(quotes.createdAt))
    .limit(1);
  const qty = latestQuote[0]?.qty ?? 1;
  const roundCount = Math.min(PRICING_PARAMS.maximumRounds, Math.max(row.round, row.trace.length));

  return (
    <>
      <Link className="negotiation-back-link" href="/merchant/negotiations"><ArrowLeft aria-hidden="true" size={15} /> All negotiations</Link>
      <div className="negotiation-detail-head">
        <div>
          <div className="negotiation-detail-meta">
            <span>{formatCategory(row.productCategory)}</span>
            <span aria-hidden="true">·</span>
            <span>{row.clientName}</span>
          </div>
          <h1 className="merchant-page-title">{row.productTitle}</h1>
          <p className="merchant-page-subtitle">{qty} {qty === 1 ? "item" : "items"} · Started {row.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
        </div>
        <Badge className={`negotiation-status-badge ${row.status}`} variant="outline">{row.status.replaceAll("_", " ")}</Badge>
      </div>

      <div className="negotiation-detail-layout">
        <section aria-labelledby="transcript-title" className="negotiation-transcript-panel">
          <div className="negotiation-panel-heading">
            <div>
              <h2 id="transcript-title">Conversation</h2>
              <p>Round {row.round} of {PRICING_PARAMS.maximumRounds}{row.lastOfferCents !== null ? ` · Current offer ${formatCents(row.lastOfferCents)}` : ""}</p>
            </div>
            <span aria-hidden="true" className="negotiation-round-count">{String(row.messages.length).padStart(2, "0")}</span>
          </div>
          <div className="negotiation-transcript">
            {row.messages.map((message, index) => {
              const buyer = message.role === "buyer";
              return (
                <article className={`negotiation-message ${buyer ? "buyer" : "merchant"}`} key={`${message.at}-${index}`}>
                  <span className="negotiation-message-avatar">
                    {buyer ? <UserRound aria-hidden="true" size={15} /> : <Bot aria-hidden="true" size={15} />}
                  </span>
                  <div className="negotiation-message-body">
                    <div className="negotiation-message-meta">
                      <strong>{buyer ? row.clientName : merchant.name}</strong>
                      <time dateTime={message.at}>{new Date(message.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</time>
                    </div>
                    <p>{message.text}</p>
                    {message.offerCents !== undefined && (
                      <span className="negotiation-offer-chip">{buyer ? "Buyer counter" : "Shop offer"} · {formatCents(message.offerCents)}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="negotiation-transcript-footer">
            <span>Pricing controlled by the shop</span>
            <strong>{row.lastOfferCents === null ? "—" : formatCents(row.lastOfferCents)}</strong>
          </div>
        </section>

        <aside aria-labelledby="why-price-title" className="negotiation-pricing-panel">
          <div className="negotiation-panel-heading">
            <div>
              <h2 id="why-price-title">Why this price</h2>
              <p>Decision traces from the pricing brain</p>
            </div>
            <Sparkles aria-hidden="true" className="pricing-panel-spark" size={19} />
          </div>
          {row.trace.length === 0 ? (
            <p className="negotiation-trace-empty">No pricing decisions have been recorded yet.</p>
          ) : (
            <div className="negotiation-trace-list">
              {row.trace.map((trace, index) => (
                <PriceTrace key={`trace-${index}`} round={index + 1} trace={trace} />
              ))}
            </div>
          )}
          <p className="negotiation-trace-footnote">Offers respond to buyer behavior and expected acceptance while staying within the pricing policy you set.</p>
        </aside>
      </div>
      <span className="sr-only">This conversation has {roundCount} pricing rounds.</span>
    </>
  );
}
