import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { productImages } from "@/lib/db/schema";

const supportedImageTypes = new Set([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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
    .select({ mime: productImages.mime, bytes: productImages.bytes })
    .from(productImages)
    .where(eq(productImages.id, parsedId.data))
    .limit(1);

  if (!image || !supportedImageTypes.has(image.mime)) {
    return Response.json({ error: "Image not found." }, { status: 404 });
  }

  return new Response(Uint8Array.from(image.bytes), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(image.bytes.byteLength),
      "Content-Type": image.mime,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
