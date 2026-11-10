import { z } from "zod";

export const listingCategories = [
  "ceramics",
  "textiles",
  "jewelry",
  "home_decor",
  "art_prints",
  "stationery",
  "kitchen",
  "accessories",
  "beauty",
  "other",
] as const;

const categorySchema = z.enum(listingCategories);
const attributesSchema = z.record(z.string().min(1).max(40), z.string().max(120))
  .refine((attributes) => Object.keys(attributes).length <= 8, "Use at most 8 attributes.");
const tagsSchema = z.array(z.string().min(1).max(32)).max(6);

export const draftProductFieldsSchema = z.object({
  title: z.string().max(80),
  description: z.string().max(600),
  category: categorySchema,
  attributes: attributesSchema,
  tags: tagsSchema,
  listPriceCents: z.number().int().min(0).max(500_000),
  floorPriceCents: z.number().int().min(0).max(500_000),
  stock: z.number().int().min(0).max(999),
  maxDiscountPct: z.number().int().min(0).max(50),
});

export const publishProductSchema = draftProductFieldsSchema.extend({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(1).max(600),
  listPriceCents: z.number().int().min(100).max(500_000),
  floorPriceCents: z.number().int().min(1).max(500_000),
}).refine((product) => product.floorPriceCents <= product.listPriceCents, {
  path: ["floorPriceCents"],
  message: "Floor price must not exceed list price.",
});

export type EditableProductFields = z.infer<typeof draftProductFieldsSchema>;

export function dollarsToCents(value: string): number {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : Number.NaN;
}
