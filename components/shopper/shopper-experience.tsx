"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { shopperEventSchema, type ShopperEvent } from "@/lib/agents/shopper-events";

const examples = [
  "Ceramic mug for my desk under $30",
  "Embroidered bookmark under $20",
] as const;

const timelineSteps = [
  { key: "parsing", label: "Understand your request", icon: Sparkles },
  { key: "searching", label: "Search the shelf", icon: Search },
  { key: "picking", label: "Pick the closest match", icon: Check },
  { key: "pass_check", label: "Check your Agent Pass", icon: ShieldCheck },
  { key: "negotiating", label: "Negotiate with the shop", icon: MessageCircle },
  { key: "paying", label: "Prepare checkout", icon: WalletCards },
] as const;

type PriceNode = { key: string; label: string; cents: number; kind: "list" | "shop" | "counter" | "agreed" };

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function eventErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const error = (value as Record<string, unknown>).error;
  return typeof error === "string" ? error : undefined;
}

function buildPriceNodes(events: ShopperEvent[]): PriceNode[] {
  const picked = [...events].reverse().find((event) => event.type === "picked");
  if (picked?.type !== "picked") return [];
  const nodes: PriceNode[] = [{ key: "list", label: "List price", cents: picked.product.price_cents, kind: "list" }];
  for (const [index, event] of events.entries()) {
    if (event.type === "shop_message" && event.offer_cents !== null && event.action !== "declined") {
      nodes.push({
        key: `shop-${index}`,
        label: event.action === "final" ? "Final offer" : event.action === "accept" ? "Accepted" : "Shop offer",
        cents: event.offer_cents,
        kind: event.action === "accept" ? "agreed" : "shop",
      });
    }
    if (event.type === "buyer_message" && event.price_cents !== undefined) {
      nodes.push({
        key: `buyer-${index}`,
        label: event.move === "accept" ? "Agreed" : "Your counter",
        cents: event.price_cents,
        kind: event.move === "accept" ? "agreed" : "counter",
      });
    }
  }
  const last = nodes[nodes.length - 1];
  const summary = [...events].reverse().find((event) => event.type === "summary");
  if (summary?.type === "summary" && last?.cents !== summary.paid_price_cents) {
    nodes.push({ key: "settled", label: "Agreed", cents: summary.paid_price_cents, kind: "agreed" });
  }
  return nodes;
}

function stepDescription(step: string): string {
  switch (step) {
    case "parsing": return "Pulling the useful details from your request.";
    case "searching": return "Checking published products against your budget.";
    case "picking": return "Comparing the best matches for your goal.";
    case "pass_check": return "Checking category and spending limits.";
    case "negotiating": return "The shopkeeper and buyer are talking through a price.";
    case "paying": return "Preparing the next payment step.";
    default: return "Waiting for your request.";
  }
}

export function ShopperExperience() {
  const [goal, setGoal] = useState("Find a handmade gift for my mom under $40");
  const [budget, setBudget] = useState("40");
  const [passToken, setPassToken] = useState("");
  const [showPassToken, setShowPassToken] = useState(false);
  const [events, setEvents] = useState<ShopperEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();
  const [transportError, setTransportError] = useState<string | undefined>();
  const abortRef = useRef<AbortController | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => () => abortRef.current?.abort(), []);

  const pickedEvent = useMemo(
    () => [...events].reverse().find((event) => event.type === "picked"),
    [events],
  );
  const passEvent = useMemo(
    () => [...events].reverse().find((event) => event.type === "pass_status"),
    [events],
  );
  const summaryEvent = useMemo(
    () => [...events].reverse().find((event) => event.type === "summary"),
    [events],
  );
  const checkoutEvent = useMemo(
    () => [...events].reverse().find((event) => event.type === "checkout"),
    [events],
  );
  const latestStatus = useMemo(
    () => [...events].reverse().find((event) => event.type === "status"),
    [events],
  );
  const priceNodes = useMemo(() => buildPriceNodes(events), [events]);
  const chatEvents = events.filter((event) => event.type === "buyer_message" || event.type === "shop_message");
  const inlineErrors = events.filter((event) => event.type === "error");

  const onSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);
    setTransportError(undefined);
    const trimmedGoal = goal.trim();
    if (trimmedGoal.length < 3 || trimmedGoal.length > 300) {
      setFormError("Keep your shopping goal between 3 and 300 characters.");
      return;
    }
    const budgetValue = budget.trim() ? Number(budget) : undefined;
    if (budgetValue !== undefined && (!Number.isFinite(budgetValue) || budgetValue <= 0 || budgetValue > 5000)) {
      setFormError("Enter a budget between $0.01 and $5,000, or leave it blank to use the amount in your goal.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setEvents([]);
    setHasRun(true);
    setRunning(true);
    const body = {
      goal: trimmedGoal,
      ...(budgetValue !== undefined ? { budget_cents: Math.round(budgetValue * 100) } : {}),
      ...(passToken.trim() ? { pass_token: passToken.trim() } : {}),
    };
    setPassToken("");

    try {
      const response = await fetch("/api/shopper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          payload = undefined;
        }
        setFormError(eventErrorMessage(payload) ?? "The Shopper Agent couldn't start. Please try again.");
        return;
      }
      if (!response.body) {
        setFormError("The Shopper Agent didn't return a stream. Please try again.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const appendLine = (line: string) => {
        if (!line.trim()) return;
        const parsed = shopperEventSchema.parse(JSON.parse(line) as unknown);
        setEvents((current) => [...current, parsed]);
      };
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) appendLine(line);
      }
      buffer += decoder.decode();
      appendLine(buffer);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setTransportError("The connection ended before the run finished. You can retry without losing your goal.");
    } finally {
      setRunning(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [budget, goal, passToken]);

  const chooseExample = (example: string) => {
    setGoal(example);
    const amount = example.match(/under\s+\$?(\d+(?:\.\d{1,2})?)/i)?.[1];
    setBudget(amount ?? "");
  };

  const completed = Boolean(summaryEvent);
  const activeStep = latestStatus?.type === "status"
    ? timelineSteps.findIndex((step) => step.key === latestStatus.step)
    : -1;
  const picked = pickedEvent?.type === "picked" ? pickedEvent : undefined;
  const passStatus = passEvent?.type === "pass_status" ? passEvent : undefined;
  const summary = summaryEvent?.type === "summary" ? summaryEvent : undefined;
  const checkout = checkoutEvent?.type === "checkout" ? checkoutEvent : undefined;

  return (
    <main className="shopper-page">
      <header className="shopper-topbar">
        <Link className="shopper-wordmark" href="/" aria-label="AgentShelf home">
          <span className="shopper-brand-icon"><Sparkles aria-hidden="true" size={16} /></span>
          <span>AgentShelf</span>
        </Link>
        <div className="shopper-topbar-note"><span className="shopper-live-dot" /> Hosted shopping agent</div>
      </header>

      <section className="shopper-intro">
        <div className="shopper-intro-copy">
          <span className="shopper-kicker"><Sparkles aria-hidden="true" size={13} /> Buyer-side AI</span>
          <h1>Find it. Haggle kindly.<br /><em>Stay in your budget.</em></h1>
          <p>Tell your Shopper Agent what you need. Watch it find a maker, negotiate with the shopkeeper, and hand off payment on your terms.</p>
        </div>
        <div className="shopper-promise">
          <span className="shopper-promise-icon"><LockKeyhole aria-hidden="true" size={17} /></span>
          <div><strong>Your budget stays in charge.</strong><span>The code sets the limit. AI helps with the words.</span></div>
        </div>
      </section>

      <form className="shopper-goal-card" onSubmit={onSubmit}>
        <div className="shopper-form-heading">
          <div>
            <span className="shopper-overline">Start with a goal</span>
            <h2>What should I look for?</h2>
          </div>
          <span className="shopper-secure-label"><ShieldCheck aria-hidden="true" size={15} /> Budget checked in code</span>
        </div>
        <label className="shopper-label" htmlFor="shopper-goal">Shopping goal</label>
        <textarea
          id="shopper-goal"
          className="shopper-goal-input"
          maxLength={300}
          minLength={3}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="A handmade gift for my mom under $40"
          rows={2}
          value={goal}
        />
        <div className="shopper-form-fields">
          <div className="shopper-field-group shopper-budget-field">
            <label className="shopper-label" htmlFor="shopper-budget">My budget</label>
            <div className="shopper-budget-input-wrap"><span>$</span><input id="shopper-budget" inputMode="decimal" min="0.01" max="5000" onChange={(event) => setBudget(event.target.value)} placeholder="40" step="0.01" type="number" value={budget} /></div>
            <span className="shopper-field-help">Leave blank to use the budget in your goal.</span>
          </div>
          <div className="shopper-field-group shopper-pass-field">
            <label className="shopper-label" htmlFor="shopper-pass">Agent Pass key <span>optional</span></label>
            <div className="shopper-pass-input-wrap">
              <input
                autoComplete="off"
                id="shopper-pass"
                onChange={(event) => setPassToken(event.target.value)}
                placeholder="asp_…"
                type={showPassToken ? "text" : "password"}
                value={passToken}
              />
              <button aria-label={showPassToken ? "Hide Agent Pass key" : "Show Agent Pass key"} className="shopper-pass-toggle" onClick={() => setShowPassToken((shown) => !shown)} type="button">
                {showPassToken ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
              </button>
            </div>
            <Link className="shopper-field-help shopper-pass-link" href="/pass">What&apos;s an Agent Pass? <ArrowUpRight aria-hidden="true" size={12} /></Link>
          </div>
        </div>
        <div className="shopper-examples">
          <span>Try an example</span>
          {examples.map((example) => (
            <button className="shopper-example-chip" key={example} onClick={() => chooseExample(example)} type="button">{example}<ChevronRight aria-hidden="true" size={13} /></button>
          ))}
        </div>
        <div className="shopper-form-bottom">
          <div className="shopper-form-error-slot" aria-live="polite">
            <AnimatePresence initial={false}>
              {formError && <motion.p className="shopper-form-error" initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><CircleAlert aria-hidden="true" size={15} />{formError}</motion.p>}
            </AnimatePresence>
          </div>
          <button className="shopper-submit" disabled={running} type="submit">
            {running ? <><LoaderCircle className="shopper-spinner" aria-hidden="true" size={17} /> Shopping…</> : <>Send my agent shopping <ArrowRight aria-hidden="true" size={17} /></>}
          </button>
        </div>
        <p className="shopper-form-footnote"><ShieldCheck aria-hidden="true" size={14} /> Without an Agent Pass, your agent returns a PayPal approval link. Nothing is charged by this form.</p>
      </form>

      <div className="shopper-run-heading">
        <div>
          <span className="shopper-overline">Live shopping run</span>
          <h2>{completed ? "Here’s how it went" : running ? "Your agent is on it" : "See the conversation unfold"}</h2>
        </div>
        <span className={`shopper-run-status ${running ? "is-running" : completed ? "is-complete" : "is-ready"}`}>
          <span />{running ? "In progress" : completed ? "Run complete" : hasRun ? "Run ended" : "Ready when you are"}
        </span>
      </div>

      <section className="shopper-ladder-shell" aria-label="Negotiated price ladder">
        <div className="shopper-ladder-caption"><span>Price path</span>{summary && <strong>You saved {money(summary.saved_cents)} <small>({summary.saved_percent}%)</small></strong>}</div>
        {priceNodes.length > 0 ? (
          <div className="shopper-price-ladder">
            {priceNodes.map((node, index) => (
              <motion.div className={`shopper-price-node is-${node.kind}`} key={node.key} initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: prefersReducedMotion ? 0 : 0.28, delay: prefersReducedMotion ? 0 : index * 0.035 }}>
                <span className="shopper-price-node-label">{node.label}</span>
                <strong>{money(node.cents)}</strong>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="shopper-ladder-empty"><span>List price</span><span className="shopper-ladder-line" /><span>Shop offer</span><span className="shopper-ladder-line" /><span>Your counter</span><span className="shopper-ladder-line" /><span>Agreed</span></div>
        )}
      </section>

      <section className="shopper-split" aria-label="Shopper Agent and shopkeeper conversation">
        <motion.section className="shopper-agent-panel" layout transition={{ duration: prefersReducedMotion ? 0 : 0.24 }} aria-labelledby="shopper-agent-title">
          <header className="shopper-panel-header">
            <span className="shopper-panel-icon shopper-agent-icon"><Sparkles aria-hidden="true" size={18} /></span>
            <div><h3 id="shopper-agent-title">Your Shopper Agent</h3><p>Finding a thoughtful match, within your limit</p></div>
            <span className="shopper-agent-chip">BUYER</span>
          </header>
          <ol className="shopper-timeline">
            {timelineSteps.map((step, index) => {
              const Icon = step.icon;
              const reached = activeStep >= index;
              const isActive = running && activeStep === index;
              const isComplete = completed || activeStep > index;
              return (
                <li className={`shopper-timeline-step ${reached ? "is-reached" : ""} ${isActive ? "is-active" : ""} ${isComplete ? "is-complete" : ""}`} key={step.key}>
                  <span className="shopper-step-marker">{isComplete ? <Check aria-hidden="true" size={13} /> : isActive ? <LoaderCircle className="shopper-spinner" aria-hidden="true" size={14} /> : <Icon aria-hidden="true" size={13} />}</span>
                  <div className="shopper-step-copy"><strong>{step.label}</strong><span>{isActive ? stepDescription(step.key) : step.key === "pass_check" && passStatus?.status === "not_provided" ? "No pass attached · approval link mode" : step.key === "pass_check" && passStatus?.status === "active" ? `${money(passStatus.remaining_cents ?? 0)} remaining on your pass` : step.key === "pass_check" && passStatus?.status === "invalid" ? "Key unavailable · continuing with approval" : step.key === "pass_check" && passStatus?.status === "category_unavailable" ? "Outside pass categories · approval link mode" : isComplete ? "Completed" : stepDescription(step.key)}</span></div>
                  {index < timelineSteps.length - 1 && <span className="shopper-step-connector" />}
                </li>
              );
            })}
          </ol>
          {picked ? (
            <motion.article className="shopper-picked-card" initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="shopper-picked-image" role="img" aria-label={picked.product.title} style={{ backgroundImage: picked.product.image_url ? `linear-gradient(180deg, transparent 55%, rgb(20 20 31 / 11%)), url(${JSON.stringify(picked.product.image_url)})` : undefined }}>
                <span>{picked.product.category}</span>
              </div>
              <div className="shopper-picked-copy"><span className="shopper-picked-label"><Check aria-hidden="true" size={12} /> Closest match</span><h4>{picked.product.title}</h4><p>{picked.product.shop} · {money(picked.product.price_cents)}</p><blockquote>{picked.reason}</blockquote></div>
            </motion.article>
          ) : (
            <div className="shopper-picked-placeholder"><span><Search aria-hidden="true" size={17} /></span><p>{hasRun ? "Your best match will appear here." : "Your chosen item and why it fits will appear here."}</p></div>
          )}
          {events.find((event) => event.type === "search_results")?.type === "search_results" && (
            <p className="shopper-result-count">{events.find((event) => event.type === "search_results")?.type === "search_results" ? events.find((event) => event.type === "search_results")?.products.length : 0} listings fit your budget</p>
          )}
        </motion.section>

        <motion.section className="shopper-chat-panel" layout transition={{ duration: prefersReducedMotion ? 0 : 0.24 }} aria-labelledby="shopper-chat-title">
          <header className="shopper-panel-header shopper-chat-header">
            <span className="shopper-panel-icon shopper-shop-icon"><MessageCircle aria-hidden="true" size={18} /></span>
            <div><h3 id="shopper-chat-title">{picked?.product.shop ?? "The shopkeeper"}</h3><p>Shopkeeper and buyer, together</p></div>
            <span className="shopper-chat-live"><span />LIVE</span>
          </header>
          <div className="shopper-chat-transcript" aria-live="polite" aria-relevant="additions text">
            {chatEvents.length > 0 ? chatEvents.map((event, index) => {
              if (event.type === "buyer_message") {
                const priceLabel = event.move === "accept" ? "Agreed" : event.move === "counter" ? "Counter" : undefined;
                return (
                  <motion.article className="shopper-chat-message is-buyer" key={`buyer-${index}`} initial={prefersReducedMotion ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
                    <div className="shopper-message-meta"><span>You · Shopper Agent</span>{priceLabel && event.price_cents !== undefined && <strong className="shopper-offer-chip is-buyer-chip">{priceLabel} {money(event.price_cents)}</strong>}</div>
                    <p>{event.text}</p>
                  </motion.article>
                );
              }
              const offerLabel = event.action === "final" ? "Final offer" : event.action === "accept" ? "Accepted" : event.action === "declined" ? undefined : "Shop offer";
              return (
                <motion.article className="shopper-chat-message is-shop" key={`shop-${index}`} initial={prefersReducedMotion ? false : { opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}>
                  <div className="shopper-message-meta"><span>{picked?.product.shop ?? "Shopkeeper"}</span>{offerLabel && event.offer_cents !== null && <strong className={`shopper-offer-chip ${event.action === "final" ? "is-final-chip" : ""}`}>{offerLabel} {money(event.offer_cents)}</strong>}</div>
                  <p>{event.text}</p>
                </motion.article>
              );
            }) : (
              <div className="shopper-chat-empty"><span><MessageCircle aria-hidden="true" size={19} /></span><strong>{running ? "Opening the conversation…" : "The conversation will appear here."}</strong><p>Your agent and the maker&apos;s shopkeeper will talk through a fair price.</p></div>
            )}
            {running && <div className="shopper-typing-indicator"><span /><span /><span /> The shop is replying</div>}
          </div>
          {summary && (
            <motion.div className="shopper-end-card" initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              {summary.flow === "agent_pass" ? (
                <>
                  <span className="shopper-end-icon is-success"><Check aria-hidden="true" size={18} /></span>
                  <div className="shopper-end-copy"><strong>Paid autonomously with your Agent Pass</strong><span>{summary.remaining_pass_budget_cents !== undefined ? `${money(summary.remaining_pass_budget_cents)} remains on your pass.` : "Your pass handled checkout."}</span>{summary.receipt_url && <a href={summary.receipt_url}>View receipt <ArrowUpRight aria-hidden="true" size={13} /></a>}</div>
                </>
              ) : checkout?.approve_url ? (
                <>
                  <span className="shopper-end-icon"><WalletCards aria-hidden="true" size={18} /></span>
                  <div className="shopper-end-copy"><strong>Your agent negotiated; you approve the payment.</strong><span>{passStatus?.status === "active" ? "This order needs your PayPal step-up approval." : "Review the final amount before paying."}</span></div>
                  <a className="shopper-approve-button" href={checkout.approve_url} rel="noreferrer" target="_blank">Approve in PayPal <ArrowUpRight aria-hidden="true" size={15} /></a>
                </>
              ) : (
                <>
                  <span className="shopper-end-icon is-success"><Check aria-hidden="true" size={18} /></span>
                  <div className="shopper-end-copy"><strong>Negotiation complete</strong><span>Your agreed price is {money(summary.paid_price_cents)}.</span>{summary.receipt_url && <a href={summary.receipt_url}>View receipt <ArrowUpRight aria-hidden="true" size={13} /></a>}</div>
                </>
              )}
            </motion.div>
          )}
          {inlineErrors.length > 0 && (
            <div className="shopper-inline-errors" aria-live="polite">
              {inlineErrors.map((event, index) => event.type === "error" ? <p key={`${index}-${event.message}`}><CircleAlert aria-hidden="true" size={14} />{event.message}</p> : null)}
            </div>
          )}
          {transportError && <div className="shopper-inline-errors" aria-live="assertive"><p><CircleAlert aria-hidden="true" size={14} />{transportError}</p></div>}
          {(transportError || (hasRun && !running && inlineErrors.length > 0 && !summary)) && (
            <button className="shopper-retry-button" onClick={() => void document.querySelector<HTMLFormElement>(".shopper-goal-card")?.requestSubmit()} type="button">Retry this search <ArrowRight aria-hidden="true" size={14} /></button>
          )}
        </motion.section>
      </section>

      <footer className="shopper-footer"><span><ShieldCheck aria-hidden="true" size={14} /> A budget-first demo. The agent cannot change its own spending limit.</span><Link href="/pass">Set up an Agent Pass <ArrowRight aria-hidden="true" size={13} /></Link></footer>
      <span className="shopper-bottom-decoration" aria-hidden="true"><ArrowDownRight size={14} /></span>
    </main>
  );
}
