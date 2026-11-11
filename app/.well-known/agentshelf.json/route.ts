import { getAppUrl } from "@/lib/env";

export function GET(): Response {
  const base = getAppUrl().replace(/\/+$/, "");
  return Response.json({
    name: "AgentShelf",
    description: "Discover handmade products, negotiate with each shop's AI shopkeeper, and pay with PayPal: autonomously with an Agent Pass, or via a human-approved PayPal link.",
    mcp_endpoint: `${base}/api/mcp`,
    tools: ["search_products", "get_product", "request_offer", "negotiate", "checkout", "order_status", "pass_status"],
    auth: { type: "bearer", optional: true, obtain: `${base}/pass` },
    shopper_url: `${base}/shopper`,
    payment: "PayPal",
    prices_include_shipping: true,
    docs_url: `${base}/llms.txt`,
  }, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
