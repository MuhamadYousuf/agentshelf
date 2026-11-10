"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { checkout } from "@/lib/commerce/checkout";
import { getDb } from "@/lib/db";
import { merchants, products } from "@/lib/db/schema";
import { issueQuote } from "@/lib/commerce/quotes";

export async function buyProductAction(formData: FormData): Promise<void> {
  const productId = formData.get("productId");
  const shopSlug = formData.get("shopSlug");
  const rawQuantity = formData.get("quantity");
  if (typeof productId !== "string" || typeof shopSlug !== "string" || typeof rawQuantity !== "string") {
    throw new Error("Choose a product and quantity before checkout.");
  }
  const quantity = Number(rawQuantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new Error("Choose a quantity from 1 to 10.");
  }

  const [listing] = await getDb().select({
    id: products.id,
    merchantId: products.merchantId,
    listPriceCents: products.listPriceCents,
  }).from(products).innerJoin(merchants, eq(products.merchantId, merchants.id))
    .where(and(
      eq(products.id, productId),
      eq(merchants.slug, shopSlug),
      eq(products.status, "published"),
    )).limit(1);
  if (!listing) redirect(`/s/${encodeURIComponent(shopSlug)}/p/${encodeURIComponent(productId)}?checkout=unavailable`);

  let destination: string;
  try {
    const quote = await issueQuote({
      productId: listing.id,
      merchantId: listing.merchantId,
      qty: quantity,
      unitPriceCents: listing.listPriceCents,
    });
    const result = await checkout({ quoteId: quote.id, agentClient: "storefront", flow: "approval_link" });
    destination = result.approveUrl ?? `/orders/${result.orderId}`;
  } catch {
    redirect(`/s/${encodeURIComponent(shopSlug)}/p/${encodeURIComponent(productId)}?checkout=unavailable`);
  }
  redirect(destination);
}
