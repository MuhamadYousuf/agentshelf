// AgentShelf — PayPal sandbox spike (owned by the architect, not part of the app).
// Answers the key architecture question: can we charge a VAULTED buyer with a DIFFERENT payee (the shop)?
// Usage (Node 18+, no deps):
//   node spikes/paypal-spike.mjs token
//   node spikes/paypal-spike.mjs order-payee [merchantEmail]      -> prints approve URL (Flow A)
//   node spikes/paypal-spike.mjs capture <orderId>
//   node spikes/paypal-spike.mjs vault-setup                       -> prints approve URL for "save PayPal"
//   node spikes/paypal-spike.mjs vault-token <setupTokenId>        -> prints vault_id
//   node spikes/paypal-spike.mjs order-vault <vaultId> [payeeEmail|none]  (Flow B)
//   node spikes/paypal-spike.mjs payout <receiverEmail> <usd>      (fallback B)
//   node spikes/paypal-spike.mjs webhooks-list | webhook-create <https-url>
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.paypal", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^(['"])(.*)\1$/, "$2")]),
);
const BASE = "https://api-m.sandbox.paypal.com";
const RETURN = "https://example.com/return"; // approval redirect target; we only need the token in the URL

async function token() {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) throw new Error("Fill .env.paypal first");
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`OAuth ${r.status}: ${JSON.stringify(j)}`);
  return j;
}

async function call(method, path, body, extraHeaders = {}) {
  const { access_token } = await token();
  const r = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": randomUUID(),
      Prefer: "return=representation",
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  console.log(`\n${method} ${path} -> HTTP ${r.status} (debug_id: ${r.headers.get("paypal-debug-id")})`);
  console.log(JSON.stringify(j, null, 2));
  return { ok: r.ok, status: r.status, body: j };
}

const approveLink = (b) => b?.links?.find((l) => ["approve", "payer-action"].includes(l.rel))?.href;
const [cmd, a1, a2] = process.argv.slice(2);

const amount = { currency_code: "USD", value: "24.00" };
switch (cmd) {
  case "token": {
    const t = await token();
    console.log("OK. scopes include vault:", t.scope.includes("vault"), "| payouts:", t.scope.includes("payouts"));
    console.log(t.scope.split(" ").join("\n"));
    break;
  }
  case "order-payee": {
    const payee = a1 || env.PAYPAL_MERCHANT1_EMAIL;
    const r = await call("POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [{ reference_id: "spike-A", description: "Spike: speckled mug", amount, payee: { email_address: payee } }],
      payment_source: { paypal: { experience_context: { return_url: RETURN, cancel_url: RETURN, shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW", brand_name: "AgentShelf" } } },
    });
    console.log("\nAPPROVE (log in as Sam Buyer):", approveLink(r.body));
    break;
  }
  case "capture":
    await call("POST", `/v2/checkout/orders/${a1}/capture`, {});
    break;
  case "vault-setup": {
    const r = await call("POST", "/v3/vault/setup-tokens", {
      payment_source: {
        paypal: {
          description: "AgentShelf Agent Pass — lets your AI agent pay within your limits",
          usage_pattern: "IMMEDIATE",
          usage_type: "MERCHANT",
          customer_type: "CONSUMER",
          permit_multiple_payment_tokens: true,
          experience_context: { return_url: RETURN, cancel_url: RETURN, brand_name: "AgentShelf", shipping_preference: "NO_SHIPPING", vault_instruction: "ON_PAYER_APPROVAL" },
        },
      },
    });
    console.log("\nAPPROVE (log in as Sam Buyer), then run: vault-token", r.body?.id, "\n", approveLink(r.body));
    break;
  }
  case "vault-token":
    await call("POST", "/v3/vault/payment-tokens", { payment_source: { token: { id: a1, type: "SETUP_TOKEN" } } });
    break;
  case "order-vault": {
    const payee = a2 === "none" ? undefined : a2 || env.PAYPAL_MERCHANT1_EMAIL;
    const pu = { reference_id: "spike-B", description: "Spike: agent purchase", amount };
    if (payee) pu.payee = { email_address: payee };
    const r = await call("POST", "/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [pu],
      payment_source: { paypal: { vault_id: a1 } },
    });
    if (r.ok && r.body.status !== "COMPLETED") {
      console.log("\nOrder not auto-completed; capturing…");
      await call("POST", `/v2/checkout/orders/${r.body.id}/capture`, {});
    }
    break;
  }
  case "payout":
    await call("POST", "/v1/payments/payouts", {
      sender_batch_header: { sender_batch_id: randomUUID(), email_subject: "AgentShelf payout", email_message: "Your agent sale settled." },
      items: [{ recipient_type: "EMAIL", receiver: a1, amount: { currency: "USD", value: a2 || "20.00" }, note: "Spike payout" }],
    });
    break;
  case "webhooks-list":
    await call("GET", "/v1/notifications/webhooks");
    break;
  case "webhook-create":
    await call("POST", "/v1/notifications/webhooks", {
      url: a1,
      event_types: ["CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED", "VAULT.PAYMENT-TOKEN.CREATED"].map((name) => ({ name })),
    });
    break;
  default:
    console.log(readFileSync(new URL(import.meta.url)).toString().split("\n").slice(1, 13).join("\n"));
}
