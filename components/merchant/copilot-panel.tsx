"use client";

import { useState } from "react";
import { Bot, LoaderCircle, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { confirmOrderRefundAction } from "@/app/merchant/(protected)/orders/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { CopilotEffect, GridViewSpec } from "@/lib/merchant/copilot-contracts";

const suggestions = [
  "How did agents sell this week?",
  "Show agent orders over $20",
  "Add tracking 1Z999AA10123456784 (UPS) to the latest Claude order",
  "Refund the latest Agent Pass order",
];

type ChatMessage = {
  id: string;
  role: "merchant" | "copilot";
  text: string;
  refund?: Extract<CopilotEffect, { type: "refund_confirmation" }>;
};

function newMessageId(): string {
  return globalThis.crypto.randomUUID();
}

export function CopilotPanel({ onGridView, onOrderChanged }: {
  onGridView?: (view: GridViewSpec) => void;
  onOrderChanged?: (orderId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [refunded, setRefunded] = useState<string[]>([]);

  async function sendMessage(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setBusy(true);
    setMessages((current) => [...current, { id: newMessageId(), role: "merchant", text: message }]);
    try {
      const response = await fetch("/api/merchant/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ message }),
      });
      const data: unknown = await response.json();
      if (!response.ok || typeof data !== "object" || data === null) {
        const errorMessage = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
          ? data.error
          : "Copilot couldn't complete that request. Try again in a moment.";
        throw new Error(errorMessage);
      }
      const result = data as { text?: unknown; effects?: unknown };
      const effects = Array.isArray(result.effects) ? result.effects as CopilotEffect[] : [];
      let refund: Extract<CopilotEffect, { type: "refund_confirmation" }> | undefined;
      for (const effect of effects) {
        if (effect.type === "grid_view") onGridView?.(effect.view);
        if (effect.type === "tracking_updated") {
          onOrderChanged?.(effect.orderId);
          toast.success(effect.message);
        }
        if (effect.type === "refund_confirmation") refund = effect;
      }
      setMessages((current) => [...current, {
        id: newMessageId(),
        role: "copilot",
        text: typeof result.text === "string" && result.text.trim() ? result.text : "I finished checking that. Please review the order details below.",
        ...(refund ? { refund } : {}),
      }]);
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Copilot couldn't complete that request. Try again in a moment.";
      setMessages((current) => [...current, { id: newMessageId(), role: "copilot", text: errorText }]);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRefund(effect: Extract<CopilotEffect, { type: "refund_confirmation" }>) {
    if (busy || refunded.includes(effect.orderId)) return;
    setBusy(true);
    try {
      const result = await confirmOrderRefundAction({ orderId: effect.orderId, reason: effect.reason });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      setRefunded((current) => [...current, effect.orderId]);
      onOrderChanged?.(effect.orderId);
      toast.success("Refund completed.");
      setMessages((current) => [...current, { id: newMessageId(), role: "copilot", text: result.message }]);
    } catch {
      toast.error("PayPal could not complete this refund. Review the order and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild><Button aria-label="Open Copilot" className="copilot-open-button" variant="outline"><Sparkles aria-hidden="true" size={15} /> Copilot</Button></SheetTrigger>
      <SheetContent className="copilot-sheet w-[min(94vw,430px)] sm:max-w-[430px]" side="right">
        <SheetHeader className="copilot-header">
          <span className="copilot-icon"><Bot aria-hidden="true" size={17} /></span>
          <div><SheetTitle>Copilot</SheetTitle><SheetDescription>Powered by PayPal Agent Toolkit</SheetDescription></div>
        </SheetHeader>
        <div aria-label="Copilot conversation" aria-live="polite" className="copilot-thread">
          {messages.length === 0 ? <div className="copilot-welcome"><span className="copilot-welcome-mark"><Sparkles aria-hidden="true" /></span><h3>How can I help your shop?</h3><p>Ask about sales, find an order, or prepare an order action.</p></div> : messages.map((message) => <article className={`copilot-message ${message.role}`} key={message.id}>
            <p>{message.text}</p>
            {message.refund && <div className="copilot-refund-confirm">
              <strong>{message.refund.summary}</strong>
              <p>This refund will be sent from AgentShelf escrow. In production the merchant payout is held until the delivery window ends.</p>
              <Button disabled={busy || refunded.includes(message.refund.orderId)} onClick={() => void confirmRefund(message.refund!)} size="sm" variant="destructive">
                {refunded.includes(message.refund.orderId) ? "Refund confirmed" : "Confirm refund"}
              </Button>
            </div>}
          </article>)}
          {busy && <div className="copilot-thinking"><LoaderCircle aria-hidden="true" className="copilot-spin" size={15} /> Checking your shop…</div>}
        </div>
        {messages.length === 0 && <div className="copilot-suggestions"><span>Try asking</span>{suggestions.map((suggestion) => <button key={suggestion} onClick={() => void sendMessage(suggestion)} type="button">{suggestion}</button>)}</div>}
        <form className="copilot-compose" onSubmit={(event) => { event.preventDefault(); void sendMessage(draft); }}>
          <label className="sr-only" htmlFor="copilot-message">Ask Copilot</label>
          <textarea id="copilot-message" maxLength={1_000} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about sales or an order…" rows={2} value={draft} />
          <Button aria-label="Send to Copilot" disabled={busy || !draft.trim()} size="icon" type="submit"><Send aria-hidden="true" size={15} /></Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
