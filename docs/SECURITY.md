# Security boundaries and evidence

This page documents controls present in the application and points to their tests. A unit test or a recorded attack run is evidence for the tested scenario, not a general security certification. The production run below is the checked-in record in `public/security/attacks-latest.json`; it was generated on 2026-11-11 and is not a new run performed while writing this document.

## Threat map

| ID | Threat | Implemented control | Test or recorded exercise |
| --- | --- | --- | --- |
| S1 | Buyer prompt injection | Buyer text can inform move classification, but only the pricing engine selects amounts and clamps to private policy. | `tests/attacks/defenses.test.ts`; production attack suite S1 |
| S2 | Seller text injection | Seller copy is marked untrusted; the hosted shopper guards quantity, budget, selected product, and generated buyer messages. | `tests/attacks/defenses.test.ts`; `lib/agents/shopper-agent.test.ts` |
| S3 | Quote integrity | Quotes use canonical JSON and HMAC-SHA256; verification checks signature, expiry, single use, published status, and arithmetic. | `lib/commerce/quotes.test.ts`; production S3a–S3c |
| S4 | Checkout retries | Existing orders are reused by quote ID; order creation, stock reservation, and quote consumption are transactional; capture completion is one-time. | `lib/commerce/checkout.test.ts`; production S4 |
| S5 | Agent Pass controls | Hashed credentials, revocation/expiry checks, mandate category and budget validation, and atomic pass-budget reservation gate Flow B. | `lib/passes/budget.test.ts`, `tests/attacks/defenses.test.ts`; production S5a–S5c |
| S6 | Webhook authenticity | PayPal verifies the raw event; external event IDs deduplicate; current PayPal order/capture state is fetched before local updates. | `lib/paypal/webhooks.test.ts`, `app/api/paypal/webhooks/route.test.ts`; production S6 |
| S7 | Stock reservation | SQL guards reserve only when `stock - reserved >= qty`; commits and releases are state-guarded and transactional. | `lib/commerce/inventory.test.ts`, `lib/commerce/checkout.test.ts` |
| S8 | Merchant tenant isolation | Protected reads/actions include the authenticated `merchant_id`; foreign order access returns not found. | `lib/agents/copilot.test.ts`, `lib/merchant/order-operations.test.ts`, and `scripts/attack-suite.ts`; production S8 |
| S9 | Image uploads | Real file magic bytes are checked and images are decoded/re-encoded; private images require an owning merchant session; published images have public immutable caching. | `lib/images/process.test.ts`; upload/image access guards are implemented in `app/api/listings/draft/route.ts` and `app/api/images/[id]/route.ts` (no route-specific test is present) |
| S10 | Payment error handling | REST errors retain status/name/details/debug ID but exclude credentials; toolkit error-shaped results cannot be treated as success and secret-like keys are stripped. | `lib/paypal/client.test.ts`, `lib/agents/toolkit-bridge.test.ts` |
| S11 | Request abuse | Atomic database fixed-window limits protect MCP, shopper runs, webhooks, and other costly operations. | `lib/security/ratelimit.test.ts`; production S11 |
| S12 | Private customer data | Agent-facing order status exposes item, total, and public tracking only; email and shipping stay in merchant/receipt views. | `lib/mcp/tools.test.ts`, `lib/mcp/public.test.ts` |
| S13 | Private merchant pricing | Floor and cost are used in server-side policy but omitted from storefront, public/MCP schemas, and LLM prompt context. | `tests/attacks/defenses.test.ts`, MCP output-schema tests; production S13 |

The checked-in production run records 12 attack scenarios plus a scoped cleanup check. It covers S1, S3a–S3c, S4, S5a–S5c, S6, S8, S11, and S13. It does not record live production results for every row in this threat map. Consult `/security` or the JSON artifact for the timestamped result list.

## Operational boundaries

- PayPal, model, database, session, and signing credentials are server-side. Do not paste real `.env.local` values into tickets or logs.
- Public MCP output is an explicit allowlist and excludes buyer email/address and private floor/cost fields.
- PayPal callbacks are not trusted from their body alone. Missing webhook configuration returns 503; invalid signatures return 400.
- The security headers currently configure Content Security Policy in Report-Only mode.
- The production demo uses PayPal sandbox. Flow B captures to the platform and pays out to the merchant as a demo escrow pattern; use PayPal Multiparty / Commerce Platform for a production funds flow.
- `pnpm secrets:scan` scans tracked repository files for likely exposed secrets. It is a repository check, not a substitute for secret rotation or provider-side monitoring.

