import type { MerchantSession } from "@/lib/auth/session";
import type { MerchantOrderRow } from "./orders-feed";

export type OrdersFeedDependencies = {
  getSession(): Promise<MerchantSession | null>;
  listOrders(merchantId: string, options: { since?: Date }): Promise<MerchantOrderRow[]>;
  now(): Date;
};

const responseHeaders = { "Cache-Control": "no-store", "Content-Type": "application/json" };

export async function ordersFeedResponse(
  request: Request,
  dependencies: OrdersFeedDependencies,
): Promise<Response> {
  const session = await dependencies.getSession();
  if (!session) return Response.json({ error: "Sign in to view your orders." }, { status: 401, headers: responseHeaders });

  const url = new URL(request.url);
  const sinceValue = url.searchParams.get("since");
  const since = sinceValue ? new Date(sinceValue) : undefined;
  if (sinceValue && (!since || !Number.isFinite(since.getTime()))) {
    return Response.json({ error: "The update cursor is invalid." }, { status: 400, headers: responseHeaders });
  }

  // Capture the next cursor before querying so a write that commits during the read is
  // either included now or still newer than the cursor on the next poll.
  const nextSince = dependencies.now().toISOString();
  const merchantOrders = await dependencies.listOrders(session.merchantId, since ? { since } : {});
  return Response.json({ orders: merchantOrders, nextSince }, { headers: responseHeaders });
}
