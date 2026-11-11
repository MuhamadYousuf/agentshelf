import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, Check, CircleHelp, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ConnectAgent } from "@/components/landing/connect-agent";
import { Button } from "@/components/ui/button";
import { getAppUrl } from "@/lib/env";
import { PublicFooter } from "@/components/site/public-footer";

export const metadata: Metadata = {
  title: "Judge tour",
  description: "A three-minute tour of AgentShelf's shopper agent, Agent Pass, MCP connection, and merchant dashboard.",
};

const steps = [
  { number: "01", icon: Sparkles, title: "Watch an AI agent shop", copy: "Set the goal and budget, then watch the Shopper Agent find a handmade piece and negotiate in a live split-screen.", href: "/shopper?goal=Find%20a%20handmade%20gift%20for%20my%20mom%20under%20%2440&budget=40", link: "Open the Shopper Agent" },
  { number: "02", icon: WalletCards, title: "Create an Agent Pass", copy: "Choose a per-order limit, total budget, expiry, and categories. A sandbox buyer approves the reusable PayPal vault request.", href: "/pass", link: "Set a spending mandate" },
  { number: "03", icon: ArrowDown, title: "Connect any MCP client", copy: "Use Claude Desktop, claude.ai, or any client that supports Streamable HTTP. The endpoint exposes product search, offers, negotiation, checkout, and order status.", href: "#connect", link: "Copy the connection config" },
  { number: "04", icon: Check, title: "See the merchant side", copy: "Review seeded sales, negotiations, payouts, and orders. Try Copilot prompts like “Show agent sales this week” or “Filter to Agent Pass orders.”", href: "/merchant/orders", link: "Open merchant orders" },
  { number: "05", icon: ShieldCheck, title: "Try to break it", copy: "The threat model and latest attack-suite results are public. The live script can be run against your own local instance.", href: "/security", link: "Review security results" },
];

export default function TourPage() {
  const endpoint = `${getAppUrl().replace(/\/+$/, "")}/api/mcp`;
  return <>
  <main className="tour-shell">
    <header className="tour-header"><Logo /><Link href="/">Back to AgentShelf <ArrowRight size={14} /></Link></header>
    <section className="tour-hero">
      <span className="tour-eyebrow"><CircleHelp size={15} /> For judges · about 3 minutes</span>
      <h1>From product photo to <em>agent purchase.</em></h1>
      <p>Follow one customer journey, then look behind the curtain at the controls that keep each shop in charge.</p>
      <div className="tour-hero-cta"><Button asChild size="lg"><Link href={steps[0]!.href}>Start the tour <ArrowRight size={16} /></Link></Button><span>Sandbox only · no real money</span></div>
    </section>
    <section aria-label="Tour steps" className="tour-steps">
      {steps.map((step) => {
        const Icon = step.icon;
        return <article className="tour-step" key={step.number}>
          <span className="tour-step-index">{step.number}</span>
          <span className="tour-step-icon"><Icon size={19} /></span>
          <div className="tour-step-copy"><h2>{step.title}</h2><p>{step.copy}</p>
            {step.number === "02" && <p className="tour-sandbox-note">Sandbox buyer credentials are in our Devpost testing instructions.</p>}
            {step.number === "04" && <div className="tour-demo-login"><span>Demo merchant login</span><code>maya@demo.agentshelf.dev</code><code>demo-maya-2026</code></div>}
            {step.number !== "03" && <Button asChild size="sm" variant="outline"><Link href={step.href}>{step.link} <ArrowRight size={14} /></Link></Button>}
          </div>
          {step.number === "03" && <div className="tour-connect" id="connect"><ConnectAgent endpoint={endpoint} /></div>}
        </article>;
      })}
    </section>
  </main>
  <PublicFooter />
  </>;
}
