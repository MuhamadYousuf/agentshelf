import { getSession } from "@/lib/auth/session";
import { getMerchantOrderDetail } from "@/lib/merchant/order-detail";
import { z } from "zod";

const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in to view your orders." }, { status: 401, headers });
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Order not found." }, { status: 404, headers });
  const order = await getMerchantOrderDetail(session.merchantId, id);
  if (!order) return Response.json({ error: "Order not found." }, { status: 404, headers });
  return Response.json({ order }, { headers });
}
