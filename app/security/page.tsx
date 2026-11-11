import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import latestAttackRunJson from "../../public/security/attacks-latest.json";

export const metadata: Metadata = {
  title: "Security and attack results",
  description: "Review AgentShelf's threat model and the latest live attack-suite results.",
};

type AttackRow = { id: string; name: string; expected: string; passed: boolean; result: string };
type AttackRun = { generatedAt: string | null; targetUrl: string | null; results: AttackRow[] };

const latestAttackRun = latestAttackRunJson as unknown as AttackRun;
const threatRows = [
  ["S1", "Buyer prompt injection", "Buyer instructions cannot override the pricing engine."],
  ["S2", "Seller text injection", "Untrusted product descriptions cannot change shopper quantity or spending limits."],
  ["S3", "Quote integrity", "Signed quotes reject unknown, expired, and altered values."],
  ["S4", "Checkout retries", "Repeated checkout reuses the same order and reservation."],
  ["S5", "Agent Pass controls", "Invalid, revoked, and over-budget passes cannot use automatic checkout."],
  ["S6", "Webhook authenticity", "PayPal events are verified and order state is re-fetched before updates."],
  ["S7", "Stock reservation", "Atomic inventory updates prevent overselling."],
  ["S8", "Merchant tenant isolation", "Order reads and actions are scoped to the signed-in shop."],
  ["S9", "Image uploads", "Magic-byte checks and image re-encoding remove disguised files and metadata."],
  ["S10", "Payment error handling", "PayPal errors remain safe and never expose credentials."],
  ["S11", "Request abuse", "Database-backed limits slow bursts on costly endpoints."],
  ["S12", "Private customer data", "Buyer email and address stay out of agent-facing responses."],
  ["S13", "Private merchant pricing", "Floor and cost are not included in storefront or MCP output."],
];

function timestamp(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC" : value;
}

export default function SecurityPage() {
  return <main className="security-page">
    <header className="security-header"><Logo /><Link href="/"><ArrowLeft size={14} /> Back to AgentShelf</Link></header>
    <section className="security-hero">
      <span className="security-eyebrow"><ShieldCheck size={15} /> Safety you can inspect</span>
      <h1>Built to keep <em>the boundaries clear.</em></h1>
      <p>AgentShelf keeps product discovery open while checkout, inventory, and merchant-only pricing stay behind explicit checks.</p>
    </section>
    <section className="security-section">
      <div className="security-section-heading"><div><span>01 · Threat model</span><h2>What we test for</h2></div><p>Short descriptions of the security boundaries exercised by the app and its tests.</p></div>
      <div className="security-table-wrap"><table className="security-table"><thead><tr><th>ID</th><th>Threat</th><th>Control</th></tr></thead><tbody>
        {threatRows.map(([id, title, control]) => <tr key={id}><td><code>{id}</code></td><th scope="row">{title}</th><td>{control}</td></tr>)}
      </tbody></table></div>
    </section>
    <section className="security-section security-results-section">
      <div className="security-section-heading"><div><span>02 · Live verification</span><h2>Latest attack results</h2></div><p>Results are recorded by the live script. Each run cleans up its test rows and does not capture a PayPal payment.</p></div>
      {latestAttackRun.generatedAt && latestAttackRun.targetUrl ? <div className="security-run-meta"><span>Run {timestamp(latestAttackRun.generatedAt)}</span><span>Target {latestAttackRun.targetUrl}</span></div> : <p className="security-no-run">No attack run has been recorded yet.</p>}
      {latestAttackRun.results.length > 0 && <div className="security-table-wrap"><table className="security-table"><thead><tr><th>ID</th><th>Attack</th><th>Expected</th><th>Result</th></tr></thead><tbody>
        {latestAttackRun.results.map((row) => <tr key={`${row.id}-${row.name}`}><td><code>{row.id}</code></td><th scope="row">{row.name}</th><td>{row.expected}</td><td><span className={`security-result-pill ${row.passed ? "pass" : "fail"}`}>{row.passed ? "Passed" : "Failed"}</span></td></tr>)}
      </tbody></table></div>}
      <div className="security-run-cta"><p>Run the suite yourself against a local or deployed instance.</p><code>pnpm attacks -- --confirm</code></div>
    </section>
    <footer className="security-footer">AgentShelf · PayPal sandbox demo</footer>
  </main>;
}
