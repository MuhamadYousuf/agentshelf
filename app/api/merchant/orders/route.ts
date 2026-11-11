import { getSession } from "@/lib/auth/session";
import { listMerchantOrders } from "@/lib/merchant/orders-feed";
import { ordersFeedResponse } from "@/lib/merchant/orders-feed-http";

export async function GET(request: Request): Promise<Response> {
  return ordersFeedResponse(request, {
    getSession,
    listOrders: listMerchantOrders,
    now: () => new Date(),
  });
}
