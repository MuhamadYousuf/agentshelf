import { config } from "dotenv";
import { shopperEventSchema, type ShopperEvent } from "@/lib/agents/shopper-events";

config({ path: ".env.local", quiet: true });

const appBase = (process.env.SHOPPER_SMOKE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const passToken = process.env.AGENTSHELF_PASS_TOKEN;
const goal = "Find a ceramic mug under $30";
const budgetCents = 3000;

function eventLine(event: ShopperEvent): string {
  switch (event.type) {
    case "status":
      return `status: ${event.step} · ${event.label}`;
    case "goal_parsed":
      return `goal_parsed: query=${JSON.stringify(event.query)} · budget=${event.budget_cents === null ? "none" : `$${(event.budget_cents / 100).toFixed(2)}`}`;
    case "search_results":
      return `search_results: ${event.products.map((product) => `${product.title} (${(product.price_cents / 100).toFixed(2)} USD)`).join("; ") || "no eligible products"}`;
    case "picked":
      return `picked: ${event.product.title} · ${event.product.shop} · ${event.reason}`;
    case "pass_status":
      return `pass_status: ${event.status}${event.remaining_cents === undefined ? "" : ` · remaining $${(event.remaining_cents / 100).toFixed(2)}`}`;
    case "buyer_message":
      return `buyer_message (${event.move}): ${event.text}`;
    case "shop_message":
      return `shop_message (${event.action}): ${event.text}`;
    case "checkout":
      return `checkout: ${event.status} · order=${event.order_id} · approve_url=${event.approve_url ? "present (redacted)" : "none"}${event.receipt_url ? " · receipt=present" : ""}`;
    case "summary":
      return `summary: ${event.item} at ${event.shop} · list=$${(event.list_price_cents / 100).toFixed(2)} · agreed=$${(event.paid_price_cents / 100).toFixed(2)} · saved=$${(event.saved_cents / 100).toFixed(2)} (${event.saved_percent}%) · rounds=${event.rounds} · flow=${event.flow}${event.remaining_pass_budget_cents === undefined ? "" : ` · remaining_pass=$${(event.remaining_pass_budget_cents / 100).toFixed(2)}`}`;
    case "error":
      return `error: ${event.message}`;
  }
}

async function main() {
  console.log("shopper:smoke: POST /api/shopper");
  console.log(`mode: ${passToken ? "Agent Pass key supplied (value not shown)" : "no Agent Pass key"}`);
  console.log(`goal: ${goal}`);
  const origin = new URL(appBase).origin;
  const response = await fetch(`${appBase}/api/shopper`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({
      goal,
      budget_cents: budgetCents,
      ...(passToken ? { pass_token: passToken } : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Shopper endpoint returned HTTP ${response.status}.`);
  }

  const events: ShopperEvent[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const collectLine = (line: string) => {
    if (!line.trim()) return;
    const event = shopperEventSchema.parse(JSON.parse(line) as unknown);
    events.push(event);
    console.log(eventLine(event));
  };
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) collectLine(line);
  }
  buffer += decoder.decode();
  collectLine(buffer);

  const checkout = events.find((event) => event.type === "checkout");
  const summary = events.find((event) => event.type === "summary");
  if (!summary) throw new Error("Shopper run ended without a summary event.");
  if (checkout?.type === "checkout" && checkout.approve_url) {
    const cancel = await fetch(`${appBase}/api/paypal/cancel?order=${encodeURIComponent(checkout.order_id)}`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (cancel.status !== 303) throw new Error(`Smoke cleanup returned HTTP ${cancel.status}, expected 303.`);
    console.log("smoke cleanup: approval-link reservation released (HTTP 303)");
  }
  console.log(`shopper:smoke: passed (${events.length} events)`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown smoke failure.";
  console.error(`shopper:smoke: failed: ${message}`);
  process.exitCode = 1;
});
