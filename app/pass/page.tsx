import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Check, Clock3, CreditCard, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MandateSummary } from "@/components/pass/mandate-summary";
import { formatCategory } from "@/lib/commerce/categories";
import { createAgentPass } from "./actions";

export const metadata: Metadata = {
  title: "Agent Pass",
  description: "Set a spending mandate for an agent, with a category list, per-order limit, budget, and expiry.",
};

const categories = [
  "ceramics",
  "textiles",
  "jewelry",
  "home_decor",
  "art_prints",
  "stationery",
  "kitchen",
  "accessories",
  "beauty",
  "other",
] as const;

type PassPageProps = { searchParams: Promise<{ error?: string; cancelled?: string }> };

export default function PassPage({ searchParams }: PassPageProps) {
  return (
    <Suspense fallback={<PassPageFallback />}>
      <PassPageContent searchParams={searchParams} />
    </Suspense>
  );
}

function PassPageFallback() {
  return (
    <main aria-busy="true" className="pass-shell">
      <div className="pass-topline"><Link className="pass-back-link" href="/">AgentShelf</Link></div>
      <div className="pass-page-loading">Preparing your spending mandate…</div>
    </main>
  );
}

async function PassPageContent({ searchParams }: PassPageProps) {
  const query = await searchParams;
  const statusMessage = query.error === "details"
    ? "Check the limits: step-up must be within the per-order limit, and the per-order limit must be within your total budget."
    : query.error === "setup"
      ? "PayPal could not start the approval. Your draft pass was closed; please try again."
      : query.error === "rate"
        ? "You have created five passes this hour. Please wait before creating another."
      : query.cancelled === "1"
        ? "Approval was cancelled. Your payment method was not saved."
        : null;
  return (
    <main className="pass-shell">
      <div className="pass-topline">
        <Link className="pass-back-link" href="/"><ArrowLeft size={16} /> Back to AgentShelf</Link>
        <span className="pass-wordmark"><span className="pass-mark"><WalletCards size={17} /></span> AgentShelf</span>
      </div>

      <div className="pass-grid">
        <section className="pass-intro">
          <h1>Give your agent room to buy <em>on your terms.</em></h1>
          <p className="pass-lede">Set the boundaries once. Your agent can find a handmade piece, agree on a price, and pay the shop without waiting for you at checkout.</p>

          <div className="pass-guardrails">
            <div className="pass-guardrail"><span><LockKeyhole size={17} /></span><div><strong>A separate key for your agent</strong><small>Copy it once. Revoke the pass whenever you want.</small></div></div>
            <div className="pass-guardrail"><span><CreditCard size={17} /></span><div><strong>PayPal holds the payment method</strong><small>AgentShelf stores a token reference, never your PayPal password.</small></div></div>
            <div className="pass-guardrail"><span><ShieldCheck size={17} /></span><div><strong>Your limits travel with the pass</strong><small>Each order is checked against your amount, category, and expiry rules.</small></div></div>
          </div>

          <div className="pass-note"><Check size={16} /><span>Listed prices include shipping. Orders above your step-up amount ask you to approve with PayPal.</span></div>
        </section>

        <section className="pass-form-card" aria-labelledby="pass-form-title">
          <div className="pass-form-head">
            <div className="pass-form-icon"><WalletCards size={20} /></div>
            <div><h2 id="pass-form-title">Create an Agent Pass</h2><p>Choose where it can shop and how much it can spend.</p></div>
          </div>

          <form id="pass-create-form" action={createAgentPass} className="pass-form">
            {statusMessage ? <p className="pass-form-alert" role="status">{statusMessage}</p> : null}
            <div className="pass-form-field">
              <Label htmlFor="pass-label">Pass name</Label>
              <Input id="pass-label" name="label" placeholder="Weekend market finds" required minLength={2} maxLength={48} defaultValue="My shopping pass" />
            </div>

            <div className="pass-amount-grid">
              <div className="pass-form-field">
                <Label htmlFor="per-order">Per-order limit</Label>
                <div className="pass-dollar-input"><span>$</span><Input id="per-order" name="perOrderMax" inputMode="decimal" type="number" min="1" step="0.01" defaultValue="50" required /></div>
              </div>
              <div className="pass-form-field">
                <Label htmlFor="total-budget">Total budget</Label>
                <div className="pass-dollar-input"><span>$</span><Input id="total-budget" name="totalBudget" inputMode="decimal" type="number" min="1" step="0.01" defaultValue="200" required /></div>
              </div>
            </div>
            <p className="pass-field-hint">Your remaining budget includes purchases in progress.</p>

            <div className="pass-amount-grid pass-second-row">
              <div className="pass-form-field">
                <Label htmlFor="step-up">Ask me above</Label>
                <div className="pass-dollar-input"><span>$</span><Input id="step-up" name="stepUpOver" inputMode="decimal" type="number" min="0.01" step="0.01" defaultValue="40" required /></div>
              </div>
              <div className="pass-form-field">
                <Label htmlFor="expires">Pass expires</Label>
                <div className="pass-select-wrap"><Clock3 size={15} /><select id="expires" name="expiresDays" defaultValue="7"><option value="1">In 1 day</option><option value="7">In 7 days</option><option value="30">In 30 days</option></select></div>
              </div>
            </div>

            <fieldset className="pass-category-fieldset">
              <legend>Where your agent can shop</legend>
              <div className="pass-category-grid">
                {categories.map((category) => (
                  <label className="pass-category-option" key={category}>
                    <input type="checkbox" name="categories" value={category} defaultChecked />
                    <span>{formatCategory(category)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <MandateSummary />
            <div className="pass-form-summary"><ShieldCheck size={17} /><span>Nothing is charged now. You’ll review and approve the PayPal vault request before an agent can spend.</span></div>
            <Button className="pass-create-button" size="lg" type="submit">Continue to PayPal <ArrowLeft className="pass-button-arrow" size={16} /></Button>
            <p className="pass-terms">By continuing, you authorize a reusable PayPal payment token for the limits above. You can revoke it at any time.</p>
          </form>
        </section>
      </div>
    </main>
  );
}
