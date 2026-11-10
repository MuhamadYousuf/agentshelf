import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ProductEditor } from "@/components/merchant/product-editor";
import { requireMerchant } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { products } from "@/lib/db/schema";

type ProductPageProps = { params: Promise<{ id: string }> };

export default async function MerchantProductReviewPage({ params }: ProductPageProps) {
  const merchant = await requireMerchant();
  const { id } = await params;
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) notFound();
  const [product] = await getDb()
    .select({
      id: products.id,
      title: products.title,
      description: products.description,
      category: products.category,
      attributes: products.attributes,
      tags: products.tags,
      listPriceCents: products.listPriceCents,
      floorPriceCents: products.floorPriceCents,
      costCents: products.costCents,
      maxDiscountPct: products.maxDiscountPct,
      stock: products.stock,
      status: products.status,
      paypalProductId: products.paypalProductId,
      images: products.images,
      moderation: products.moderation,
      aiSuggestions: products.aiSuggestions,
    })
    .from(products)
    .where(and(eq(products.id, parsedId.data), eq(products.merchantId, merchant.id)))
    .limit(1);

  if (!product) notFound();
  return <ProductEditor product={product} />;
}
