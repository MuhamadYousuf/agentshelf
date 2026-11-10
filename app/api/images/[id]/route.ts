import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { productImages, products } from "@/lib/db/schema";

type ImageRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: ImageRouteContext) {
  await connection();
  const { id } = await params;
  const parsedId = z.uuid().safeParse(id);

  if (!parsedId.success) {
    return Response.json({ error: "Image not found." }, { status: 404 });
  }

  const [image] = await getDb()
    .select({
      mime: productImages.mime,
      bytes: productImages.bytes,
      merchantId: productImages.merchantId,
      productId: productImages.productId,
      productStatus: products.status,
    })
    .from(productImages)
    .leftJoin(products, eq(productImages.productId, products.id))
    .where(eq(productImages.id, parsedId.data))
    .limit(1);

  if (!image || image.mime !== "image/webp" || !image.productId || !image.productStatus) {
    return Response.json({ error: "Image not found." }, { status: 404 });
  }

  const isPublished = image.productStatus === "published";
  if (!isPublished) {
    const session = await getSession();
    if (!session || session.merchantId !== image.merchantId) {
      return Response.json({ error: "Image not found." }, { status: 404 });
    }
  }

  return new Response(Uint8Array.from(image.bytes), {
    headers: {
      "Cache-Control": isPublished
        ? "public, max-age=31536000, immutable"
        : "private, no-store",
      "Content-Length": String(image.bytes.byteLength),
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
