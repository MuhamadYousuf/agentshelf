import {
  ArrowRight,
  Camera,
  Check,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { HeroMotion } from "@/components/landing/hero-motion";
import { HeroPreview } from "@/components/landing/hero-preview";
import { ConnectAgent } from "@/components/landing/connect-agent";
import { Button } from "@/components/ui/button";
import { getAppUrl } from "@/lib/env";
import { PublicFooter } from "@/components/site/public-footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AgentShelf — shops ready for AI agents",
  description: "PayPal-powered agent commerce for independent shops: publish handmade products, negotiate within shop policy, and check out safely.",
};

const makerFeatures = [
  "Turn product photos into listing drafts you can review.",
  "Set the price floor and discount rules agents must follow.",
  "See agent orders and negotiations in one merchant dashboard.",
];

const agentFeatures = [
  "A public MCP endpoint for discovering published products.",
  "Signed quotes with clear totals and short expirations.",
  "Optional Agent Pass mandates with spending limits.",
];

export default function HomePage() {
  const mcpEndpoint = `${getAppUrl().replace(/\/+$/, "")}/api/mcp`;
  return (
    <>
      <header className="site-header">
        <div className="page-wrap site-header-inner">
          <Logo />
          <nav aria-label="Main navigation" className="header-nav">
            <a href="#how-it-works">How it works</a>
            <a href="#for-makers">For makers</a>
            <a href="#for-agents">For AI agents</a>
            <a href="#connect-agent">Connect</a>
            <Link href="/tour">Judge tour</Link>
          </nav>
          <div className="header-actions">
            <Link className="header-login" href="/merchant/login">
              Sign in
            </Link>
            <Button asChild className="header-cta">
              <Link href="/merchant/signup">Open my shop</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="page-wrap">
            <HeroMotion>
              <div className="hero-grid">
                <div className="hero-copy">
                  <h1 className="hero-title">
                    Your next customer is an <em>AI agent.</em>
                  </h1>
                  <p className="hero-lead">
                    AgentShelf turns a few product photos into a shop that AI
                    assistants can find, negotiate with, and pay — safely, with
                    PayPal.
                  </p>
                  <div className="hero-ctas">
                    <Button asChild className="hero-cta-primary">
                      <Link href="/shopper">
                        Watch an agent shop <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                    <Button asChild className="hero-cta-secondary" variant="outline">
                      <Link href="/tour">Judge tour</Link>
                    </Button>
                    <Button asChild className="hero-cta-secondary" variant="outline">
                      <Link href="/merchant/login">Merchant sign in</Link>
                    </Button>
                  </div>
                  <div className="hero-footnote">
                    <Check aria-hidden="true" size={15} />
                    <span>Built for independent shops and agent buyers</span>
                  </div>
                </div>
                <HeroPreview />
              </div>
            </HeroMotion>
          </div>
        </section>

        <section aria-label="AgentShelf technology" className="landing-stack-strip">
          PayPal Orders v2 · Vault v3 · Payouts · Catalog · Webhooks · Agent Toolkit · MCP · Gemini
        </section>

        <section aria-labelledby="how-title" className="section-block how-section" id="how-it-works">
          <div className="page-wrap">
            <h2 className="section-heading" id="how-title">
              From a few photos to an open door.
            </h2>
            <p className="section-intro">
              A simple path keeps every listing grounded in the maker&apos;s
              details and every agent purchase inside the shop&apos;s rules.
            </p>
            <div className="steps-grid">
              <article className="step-item">
                <span className="step-index">01</span>
                <h3 className="step-title">Snap</h3>
                <p className="step-copy">
                  Photograph a product. AgentShelf prepares a useful listing
                  draft from the details you provide.
                </p>
              </article>
              <article className="step-item">
                <span className="step-index">02</span>
                <h3 className="step-title">Publish</h3>
                <p className="step-copy">
                  Review the description, set your price floor, and publish
                  when the listing is ready.
                </p>
              </article>
              <article className="step-item">
                <span className="step-index">03</span>
                <h3 className="step-title">Agents buy</h3>
                <p className="step-copy">
                  Agents find your shop, negotiate within your policy, and pay
                  through the approved flow.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="section-block audience-section">
          <div className="page-wrap">
            <div className="audience-grid">
              <article aria-labelledby="makers-title" className="audience-panel" id="for-makers">
                <div className="audience-panel-header">
                  <span className="audience-icon">
                    <Camera aria-hidden="true" />
                  </span>
                </div>
                <h2 className="audience-title" id="makers-title">
                  For makers, your craft stays yours.
                </h2>
                <p className="audience-copy">
                  Set the terms that make sense for your shop, then let new
                  customers find the work you already make.
                </p>
                <ul className="feature-list">
                  {makerFeatures.map((feature) => (
                    <li key={feature}>
                      <Check aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article aria-labelledby="agents-title" className="audience-panel agent-panel" id="for-agents">
                <div className="audience-panel-header">
                  <span className="audience-icon">
                    <Sparkles aria-hidden="true" />
                  </span>
                </div>
                <h2 className="audience-title" id="agents-title">
                  For AI agents, shop with clear boundaries.
                </h2>
                <p className="audience-copy">
                  Find products through a consistent interface and carry
                  explicit buyer permission through checkout.
                </p>
                <ul className="feature-list">
                  {agentFeatures.map((feature) => (
                    <li key={feature}>
                      <Check aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="agent-pass-explainer">
                  <strong>Agent Pass, with your limits attached.</strong>
                  <p>Vault a PayPal wallet with your approval, then set a per-order cap, total budget, category list, and expiry. Larger orders pause for your PayPal approval; revoke the pass any time.</p>
                  <Link href="/pass">Create an Agent Pass <ArrowRight aria-hidden="true" size={15} /></Link>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section aria-labelledby="connect-agent-title" className="section-block connect-agent-section" id="connect-agent">
          <div className="page-wrap connect-agent-grid">
            <div className="connect-agent-intro">
              <h2 className="section-heading" id="connect-agent-title">Connect your agent.</h2>
              <p className="section-intro">
                Give your assistant one endpoint to search the shelf, request a signed offer, and hand a PayPal approval link back to you.
              </p>
              <div className="connect-agent-endpoint">
                <span>Streamable HTTP endpoint</span>
                <code>{mcpEndpoint}</code>
              </div>
            </div>
            <ConnectAgent endpoint={mcpEndpoint} />
          </div>
        </section>

        <section aria-label="Payment protection" className="trust-band">
          <div className="page-wrap trust-band-inner">
            <span className="trust-icon">
              <ShieldCheck aria-hidden="true" />
            </span>
            <p className="trust-copy">
              Every agent purchase is a PayPal transaction — buyer &amp; seller
              protection included.
            </p>
          </div>
        </section>

        <section className="closing-section">
          <div className="page-wrap">
            <div className="closing-panel">
              <div>
                <h2 className="closing-title">Make room for a new kind of customer.</h2>
                <p className="closing-copy">
                  Bring your catalog. You decide what gets published, what can
                  be negotiated, and when an order needs your attention.
                </p>
              </div>
              <Button asChild className="closing-cta">
                <Link href="/merchant/signup">
                  Open my shop <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </>
  );
}
