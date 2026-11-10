import "server-only";

import { getAppUrl } from "@/lib/env";
import { sanitizeListingText } from "@/lib/security/sanitize";
import { PayPalError, paypalFetch } from "./client";

export type CreateCatalogProductInput = {
  id: string;
  name: string;
  description: string;
  type: "PHYSICAL";
  category?: string;
  imageUrl?: string;
  homeUrl?: string;
};

export type CatalogProduct = {
  id: string;
  name: string;
  description?: string;
  type: "PHYSICAL";
  category?: string;
  image_url?: string;
  home_url?: string;
  create_time?: string;
  update_time?: string;
};

export function buildCatalogProductPayload(input: CreateCatalogProductInput) {
  const appIsHttps = new URL(getAppUrl()).protocol === "https:";
  const isHttpsUrl = (value: string | undefined) => {
    if (!value || !appIsHttps) return false;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  };
  const category = input.category?.toLowerCase() === "accessories"
    ? "ACCESSORIES"
    : undefined;
  return {
    id: input.id,
    name: sanitizeListingText(input.name, 127),
    description: sanitizeListingText(input.description, 256),
    type: input.type,
    ...(category ? { category } : {}),
    ...(isHttpsUrl(input.imageUrl) ? { image_url: input.imageUrl } : {}),
    ...(isHttpsUrl(input.homeUrl) ? { home_url: input.homeUrl } : {}),
  };
}

export async function createCatalogProduct(
  input: CreateCatalogProductInput,
): Promise<CatalogProduct> {
  const body = buildCatalogProductPayload(input);
  return paypalFetch<CatalogProduct>("/v1/catalogs/products", {
    method: "POST",
    body,
    requestId: `catalog-${input.id}`,
  });
}

export async function getCatalogProduct(id: string): Promise<CatalogProduct> {
  return paypalFetch<CatalogProduct>(`/v1/catalogs/products/${encodeURIComponent(id)}`, {
    method: "GET",
  });
}

export function isDuplicateCatalogProductIdentifierError(error: unknown): boolean {
  if (!(error instanceof PayPalError) || error.status !== 422 || !Array.isArray(error.details)) {
    return false;
  }
  return error.details.some((detail) => {
    if (typeof detail !== "object" || detail === null) return false;
    const value = detail as Record<string, unknown>;
    return value.issue === "DUPLICATE_RESOURCE_IDENTIFIER" && value.field === "/id";
  });
}

function matchesCatalogPayload(
  product: CatalogProduct,
  expected: ReturnType<typeof buildCatalogProductPayload>,
): boolean {
  return product.id === expected.id &&
    product.name === expected.name &&
    product.description === expected.description &&
    product.type === expected.type &&
    product.category === expected.category &&
    product.image_url === expected.image_url &&
    product.home_url === expected.home_url;
}

export async function createOrRecoverCatalogProduct(
  input: CreateCatalogProductInput,
): Promise<CatalogProduct> {
  try {
    return await createCatalogProduct(input);
  } catch (error) {
    if (!isDuplicateCatalogProductIdentifierError(error)) throw error;
    const existing = await getCatalogProduct(input.id);
    if (!matchesCatalogPayload(existing, buildCatalogProductPayload(input))) throw error;
    return existing;
  }
}
