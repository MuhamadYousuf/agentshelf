import { getAppUrl } from "@/lib/env";

export function GET(): Response {
  const base = getAppUrl().replace(/\/+$/, "");
  return Response.json({
    name: "AgentShelf",
    description: "Discover handmade products, negotiate within shop policy, and create human-approved PayPal checkout links.",
    mcp_endpoint: `${base}/api/mcp`,
    tools: ["search_products", "get_product", "request_offer", "negotiate", "checkout", "order_status"],
    payment: "PayPal",
    prices_include_shipping: true,
    docs_url: `${base}/llms.txt`,
  }, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
