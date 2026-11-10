import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { moderateListing } from "@/lib/agents/moderation";
import { draftListing } from "@/lib/agents/lister";
import { getDb } from "@/lib/db";
import { events, merchants, productImages, products } from "@/lib/db/schema";
import { processProductImage, detectImageMime } from "@/lib/images/process";
import { consumeFixedWindowLimit } from "@/lib/security/ratelimit";
import { sanitizeListingText } from "@/lib/security/sanitize";

export const maxDuration = 60;

const MAX_IMAGE_COUNT = 6;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4.5 * 1024 * 1024;

function jsonError(message: string, status: number): Response {
  return Response.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return jsonError("Sign in to draft a listing.", 401);
  const db = getDb();
  const [merchant] = await db.select({ name: merchants.name })
    .from(merchants)
    .where(eq(merchants.id, session.merchantId))
    .limit(1);
  if (!merchant) return jsonError("Sign in to draft a listing.", 401);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Choose one to six product photos and try again.", 400);
  }

  const files = formData.getAll("images").filter((entry): entry is File => entry instanceof File);
  if (files.length < 1 || files.length > MAX_IMAGE_COUNT) {
    return jsonError("Add between one and six photos of the same item.", 400);
  }
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (files.some((file) => file.size > MAX_FILE_BYTES) || totalBytes > MAX_TOTAL_BYTES) {
    return jsonError("These photos are too large. Try fewer or smaller photos.", 413);
  }

  const limit = await consumeFixedWindowLimit({
    key: `listing-draft:${session.merchantId}`,
    limit: 20,
    windowMs: 60 * 60 * 1_000,
  });
  if (!limit.allowed) {
    return jsonError("You have drafted 20 listings this hour. Try again after the hourly reset.", 429);
  }

  let processedImages: Awaited<ReturnType<typeof processProductImage>>[];
  try {
    processedImages = [];
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!detectImageMime(bytes)) {
        return jsonError("One photo is not a supported JPEG, PNG, or WebP image.", 415);
      }
      processedImages.push(await processProductImage(bytes));
    }
  } catch {
    return jsonError("We couldn't read one of these photos. Try a clear JPEG, PNG, or WebP image.", 415);
  }

  let productId: string;
  try {
    productId = await db.transaction(async (transaction) => {
      const [product] = await transaction
        .insert(products)
        .values({
          merchantId: session.merchantId,
          title: "",
          description: "",
          attributes: {},
          tags: [],
          images: [],
          category: "other",
          listPriceCents: 3_200,
          floorPriceCents: 2_560,
          maxDiscountPct: 15,
          moderation: { status: "review", reasons: [], source: [], checkedAt: new Date().toISOString() },
          status: "draft",
        })
        .returning({ id: products.id });
      if (!product) throw new Error("Draft could not be created.");

      const metadata = await transaction
        .insert(productImages)
        .values(processedImages.map((image) => ({
          productId: product.id,
          merchantId: session.merchantId,
          mime: image.mime,
          width: image.width,
          height: image.height,
          bytes: image.bytes,
        })))
        .returning({ id: productImages.id, mime: productImages.mime, width: productImages.width, height: productImages.height });
      await transaction
        .update(products)
        .set({ images: metadata, updatedAt: new Date() })
        .where(eq(products.id, product.id));
      return product.id;
    });
  } catch {
    return jsonError("We couldn't save this draft. Please try again.", 500);
  }

  const hintValue = formData.get("hint");
  const hint = typeof hintValue === "string" ? sanitizeListingText(hintValue, 500) : undefined;
  const listing = await draftListing({
    images: processedImages.map((image) => ({ mime: image.mime, bytes: image.bytes })),
    ...(hint ? { hint } : {}),
    shopName: merchant.name,
  });
  const moderation = moderateListing({
    title: listing.title,
    description: listing.description,
    attributes: listing.attributes,
    tags: listing.tags,
    modelVerdict: listing.moderation.verdict,
    modelReasons: listing.moderation.reasons,
  });

  try {
    await db.update(products)
      .set({
        title: listing.title,
        description: listing.description,
        category: listing.category,
        attributes: listing.attributes,
        tags: listing.tags,
        listPriceCents: listing.suggestedListPriceCents,
        floorPriceCents: listing.suggestedFloorPriceCents,
        aiSuggestions: {
          listPriceCents: listing.suggestedListPriceCents,
          floorPriceCents: listing.suggestedFloorPriceCents,
          confidence: listing.confidence,
          ...(listing.manualFallback ? { manualFallback: true } : {}),
        },
        moderation,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));

    await db.insert(events).values({
      merchantId: session.merchantId,
      type: "listing.drafted",
      source: "merchant",
      payload: {
        productId,
        imageCount: processedImages.length,
        manualFallback: listing.manualFallback,
        moderationStatus: moderation.status,
      },
    });
  } catch {
    return jsonError("The photos were saved, but the listing could not be finished. Open it from your drafts to continue.", 500);
  }

  return Response.json({ productId }, { headers: { "Cache-Control": "no-store" } });
}
