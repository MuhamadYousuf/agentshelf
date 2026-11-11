import { z } from "zod";

const searchProductEventSchema = z.object({
  product_id: z.string().uuid(),
  title: z.string().max(80),
  price_cents: z.number().int().positive(),
}).strict();

const pickedProductSchema = z.object({
  product_id: z.string().uuid(),
  title: z.string().max(80),
  shop: z.string().max(80),
  price_cents: z.number().int().positive(),
  category: z.string().max(40),
  description: z.string().max(600),
  image_url: z.string().url().nullable(),
  product_url: z.string().url(),
}).strict();

export const shopperEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("status"),
    step: z.enum(["parsing", "searching", "picking", "pass_check", "negotiating", "paying"]),
    label: z.string().max(80),
  }).strict(),
  z.object({
    type: z.literal("goal_parsed"),
    query: z.string().max(100),
    budget_cents: z.number().int().positive().nullable(),
    recipient: z.string().max(80).optional(),
    occasion: z.string().max(80).optional(),
  }).strict(),
  z.object({
    type: z.literal("search_results"),
    products: z.array(searchProductEventSchema).max(8),
  }).strict(),
  z.object({
    type: z.literal("picked"),
    product: pickedProductSchema,
    reason: z.string().max(140),
  }).strict(),
  z.object({
    type: z.literal("pass_status"),
    status: z.enum(["active", "not_provided", "invalid", "category_unavailable"]),
    remaining_cents: z.number().int().nonnegative().optional(),
    expires_at: z.string().datetime().optional(),
  }).strict(),
  z.object({
    type: z.literal("buyer_message"),
    text: z.string().max(240),
    move: z.enum(["counter", "accept", "walk_away"]),
    price_cents: z.number().int().positive().optional(),
  }).strict(),
  z.object({
    type: z.literal("shop_message"),
    text: z.string().max(400),
    action: z.enum(["offer", "accept", "final", "declined"]),
    offer_cents: z.number().int().nonnegative().nullable(),
    round: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    type: z.literal("checkout"),
    status: z.string().max(40),
    approve_url: z.string().url().optional(),
    order_id: z.string().uuid(),
    receipt_url: z.string().url().optional(),
  }).strict(),
  z.object({
    type: z.literal("summary"),
    item: z.string().max(80),
    shop: z.string().max(80),
    list_price_cents: z.number().int().positive(),
    paid_price_cents: z.number().int().positive(),
    saved_cents: z.number().int(),
    saved_percent: z.number().min(0).max(100),
    rounds: z.number().int().nonnegative(),
    flow: z.enum(["agent_pass", "approval_link"]),
    receipt_url: z.string().url().optional(),
    remaining_pass_budget_cents: z.number().int().nonnegative().optional(),
  }).strict(),
  z.object({
    type: z.literal("error"),
    message: z.string().min(1).max(300),
  }).strict(),
]);

export type ShopperEvent = z.infer<typeof shopperEventSchema>;

export function validateShopperEvent(event: ShopperEvent): ShopperEvent {
  return shopperEventSchema.parse(event);
}
