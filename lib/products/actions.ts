"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { improveListingDescription } from "@/lib/agents/lister";
import { moderateListing } from "@/lib/agents/moderation";
import { getDb } from "@/lib/db";
import { events, merchants, productImages, products, type ModerationData } from "@/lib/db/schema";
import { createOrRecoverCatalogProduct } from "@/lib/paypal/catalog";
import { PayPalError } from "@/lib/paypal/client";
import { getAppUrl } from "@/lib/env";
import {
  dollarsToCents,
  draftProductFieldsSchema,
  listingCategories,
  publishProductSchema,
} from "@/lib/security/product-input";
import { sanitizeListingText } from "@/lib/security/sanitize";

export type ProductActionResult = {
  ok: boolean;
  message: string;
  description?: string;
  syncPending?: boolean;
  navigateTo?: string;
};

const idSchema = z.uuid();
const categorySchema = z.enum(listingCategories);

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readList(formData: FormData, name: string): string[] {
  return formData.getAll(name).filter((value): value is string => typeof value === "string");
}

function readAttributes(formData: FormData): Record<string, string> {
  const keys = readList(formData, "attributeKey");
  const values = readList(formData, "attributeValue");
  const attributes: Array<[string, string]> = [];
  for (let index = 0; index < Math.min(keys.length, values.length, 9); index += 1) {
    const key = sanitizeListingText(keys[index] ?? "", 40);
    const value = sanitizeListingText(values[index] ?? "", 120);
    if (key || value) attributes.push([key, value]);
  }
  return Object.fromEntries(attributes);
}

function readTags(formData: FormData): string[] {
  return readText(formData, "tags")
    .split(/[\n,]/)
    .map((tag) => sanitizeListingText(tag, 32))
    .filter((tag, index, tags) => tag.length > 0 && tags.indexOf(tag) === index)
    .slice(0, 7);
}

function readEditableFields(formData: FormData) {
  return {
    title: sanitizeListingText(readText(formData, "title"), 80),
    description: sanitizeListingText(readText(formData, "description"), 600),
    category: readText(formData, "category"),
    attributes: readAttributes(formData),
    tags: readTags(formData),
    listPriceCents: dollarsToCents(readText(formData, "listPrice")),
    floorPriceCents: dollarsToCents(readText(formData, "floorPrice")),
    stock: Number(readText(formData, "stock")),
    maxDiscountPct: Number(readText(formData, "maxDiscountPct")),
  };
}

async function ownedProduct(idValue: unknown, merchantId: string) {
  const parsedId = idSchema.safeParse(idValue);
  if (!parsedId.success) return undefined;
  const [product] = await getDb()
    .select()
    .from(products)
    .where(and(eq(products.id, parsedId.data), eq(products.merchantId, merchantId)))
    .limit(1);
  return product;
}

async function merchantSession() {
  const session = await getSession();
  if (!session) return null;
  return session;
}

function moderationFor(
  fields: { title: string; description: string; attributes: Record<string, string>; tags: string[] },
  currentModeration: ModerationData,
): ModerationData {
  return moderateListing({
    ...fields,
    ...(currentModeration.modelVerdict
      ? {
          modelVerdict: currentModeration.modelVerdict,
          modelReasons: currentModeration.modelReasons ?? [],
        }
      : {}),
  });
}

function invalidFieldsMessage(error: z.ZodError): string {
  const first = error.issues[0];
  return first?.message ?? "Check the listing details and try again.";
}

function revalidateProductViews(id: string, slug?: string): void {
  revalidatePath("/merchant");
  revalidatePath("/merchant/products");
  revalidatePath(`/merchant/products/${id}`);
  if (slug) revalidatePath(`/s/${slug}`);
}

export async function saveProductAction(formData: FormData): Promise<ProductActionResult> {
  const session = await merchantSession();
  if (!session) return { ok: false, message: "Sign in to save this listing." };
  const id = readText(formData, "productId");
  const product = await ownedProduct(id, session.merchantId);
  if (!product) return { ok: false, message: "Listing not found." };

  const parsed = draftProductFieldsSchema.safeParse(readEditableFields(formData));
  if (!parsed.success) return { ok: false, message: invalidFieldsMessage(parsed.error) };
  const fields = parsed.data;
  const moderation = moderationFor(fields, product.moderation);
  const status = product.status === "published" && moderation.status !== "allowed"
    ? "draft"
    : product.status;

  await getDb().update(products).set({
    ...fields,
    maxDiscountPct: fields.maxDiscountPct,
    moderation,
    status,
    updatedAt: new Date(),
  }).where(and(eq(products.id, product.id), eq(products.merchantId, session.merchantId)));

  revalidateProductViews(product.id);
  return {
    ok: true,
    message: status === "draft" && product.status === "published"
      ? "Saved as a draft because the policy check needs your attention."
      : product.status === "published" ? "Changes saved." : "Draft saved.",
  };
}

async function syncPayPalCatalog(productId: string, merchantId: string): Promise<ProductActionResult> {
  const product = await ownedProduct(productId, merchantId);
  if (!product || product.status !== "published") {
    return { ok: false, message: "Publish this listing before syncing the PayPal Catalog." };
  }
  if (product.paypalProductId) {
    return { ok: true, message: "This product is already synced to PayPal Catalog." };
  }

  const [merchant] = await getDb()
    .select({ slug: merchants.slug })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);
  if (!merchant) return { ok: false, message: "Shop not found." };

  const appUrl = getAppUrl().replace(/\/+$/, "");
  const image = product.images[0];
  try {
    const catalogProduct = await createOrRecoverCatalogProduct({
      id: product.id,
      name: product.title,
      description: product.description,
      type: "PHYSICAL",
      category: product.category,
      ...(image ? { imageUrl: `${appUrl}/api/images/${image.id}` } : {}),
      homeUrl: `${appUrl}/s/${merchant.slug}`,
    });
    if (!catalogProduct.id) throw new Error("PayPal did not return a Catalog product ID.");

    await getDb().update(products)
      .set({ paypalProductId: catalogProduct.id, updatedAt: new Date() })
      .where(and(eq(products.id, product.id), eq(products.merchantId, merchantId)));
    await getDb().insert(events).values({
      merchantId,
      type: "paypal.catalog_synced",
      source: "merchant",
      payload: { productId: product.id, paypalProductId: catalogProduct.id },
    });
    revalidateProductViews(product.id, merchant.slug);
    return { ok: true, message: "Product published and synced to PayPal Catalog." };
  } catch (error) {
    const debugId = error instanceof PayPalError ? error.debugId : undefined;
    const status = error instanceof PayPalError ? error.status : undefined;
    await getDb().insert(events).values({
      merchantId,
      type: "paypal.catalog_failed",
      source: "merchant",
      payload: {
        productId: product.id,
        ...(debugId ? { debugId } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });
    revalidateProductViews(product.id, merchant.slug);
    return {
      ok: true,
      message: "Published. PayPal Catalog sync is pending — retry when ready.",
      syncPending: true,
    };
  }
}

export async function publishProductAction(formData: FormData): Promise<ProductActionResult> {
  const session = await merchantSession();
  if (!session) return { ok: false, message: "Sign in to publish this listing." };
  const id = readText(formData, "productId");
  const product = await ownedProduct(id, session.merchantId);
  if (!product) return { ok: false, message: "Listing not found." };

  const parsed = publishProductSchema.safeParse(readEditableFields(formData));
  if (!parsed.success) return { ok: false, message: invalidFieldsMessage(parsed.error) };
  const fields = parsed.data;
  const moderation = moderationFor(fields, product.moderation);
  if (moderation.status === "blocked") {
    return { ok: false, message: "This listing is blocked by the policy check and cannot be published." };
  }
  if (moderation.status === "review" && formData.get("aupConfirmed") !== "on") {
    return { ok: false, message: "Confirm that this item complies with PayPal's Acceptable Use Policy to publish." };
  }

  const [merchant] = await getDb()
    .select({ slug: merchants.slug })
    .from(merchants)
    .where(eq(merchants.id, session.merchantId))
    .limit(1);
  if (!merchant) return { ok: false, message: "Shop not found." };

  await getDb().transaction(async (transaction) => {
    await transaction.update(products).set({
      ...fields,
      moderation,
      status: "published",
      updatedAt: new Date(),
    }).where(and(eq(products.id, product.id), eq(products.merchantId, session.merchantId)));
    await transaction.insert(events).values({
      merchantId: session.merchantId,
      type: "listing.published",
      source: "merchant",
      payload: { productId: product.id },
    });
  });
  revalidateProductViews(product.id, merchant.slug);

  return syncPayPalCatalog(product.id, session.merchantId);
}

export async function retryCatalogAction(formData: FormData): Promise<ProductActionResult> {
  const session = await merchantSession();
  if (!session) return { ok: false, message: "Sign in to retry the PayPal Catalog sync." };
  const id = readText(formData, "productId");
  if (!idSchema.safeParse(id).success) return { ok: false, message: "Listing not found." };
  return syncPayPalCatalog(id, session.merchantId);
}

export async function unpublishProductAction(formData: FormData): Promise<ProductActionResult> {
  const session = await merchantSession();
  if (!session) return { ok: false, message: "Sign in to unpublish this listing." };
  const product = await ownedProduct(readText(formData, "productId"), session.merchantId);
  if (!product) return { ok: false, message: "Listing not found." };

  await getDb().update(products)
    .set({ status: "draft", updatedAt: new Date() })
    .where(and(eq(products.id, product.id), eq(products.merchantId, session.merchantId)));
  const [merchant] = await getDb()
    .select({ slug: merchants.slug })
    .from(merchants)
    .where(eq(merchants.id, session.merchantId))
    .limit(1);
  revalidateProductViews(product.id, merchant?.slug);
  return { ok: true, message: "Listing moved to drafts." };
}

export async function deleteDraftAction(formData: FormData): Promise<ProductActionResult> {
  const session = await merchantSession();
  if (!session) return { ok: false, message: "Sign in to delete this draft." };
  const product = await ownedProduct(readText(formData, "productId"), session.merchantId);
  if (!product) return { ok: false, message: "Listing not found." };
  if (product.status !== "draft") return { ok: false, message: "Only drafts can be deleted." };

  const db = getDb();
  await db.transaction(async (transaction) => {
    await transaction.delete(productImages).where(and(
      eq(productImages.productId, product.id),
      eq(productImages.merchantId, session.merchantId),
    ));
    await transaction.delete(products).where(and(
      eq(products.id, product.id),
      eq(products.merchantId, session.merchantId),
    ));
  });
  revalidateProductViews(product.id);
  return { ok: true, message: "Draft and its photos deleted.", navigateTo: "/merchant/products" };
}

export async function improveDescriptionAction(formData: FormData): Promise<ProductActionResult> {
  const session = await merchantSession();
  if (!session) return { ok: false, message: "Sign in to improve this description." };
  const product = await ownedProduct(readText(formData, "productId"), session.merchantId);
  if (!product) return { ok: false, message: "Listing not found." };

  const category = categorySchema.safeParse(readText(formData, "category"));
  if (!category.success) return { ok: false, message: "Choose a product category first." };
  const description = sanitizeListingText(readText(formData, "description"), 600);
  const title = sanitizeListingText(readText(formData, "title"), 80);
  const improved = await improveListingDescription({
    title,
    description,
    category: category.data,
    attributes: readAttributes(formData),
  });
  return { ok: true, message: "Description ready to review.", description: improved };
}
