import { z } from "zod";

export const shopperRequestSchema = z.object({
  goal: z.string().trim().min(3).max(300),
  budget_cents: z.number().int().min(1).max(500_000).optional(),
  pass_token: z.string().min(1).max(200).optional(),
}).strict();

export type ShopperRequest = z.infer<typeof shopperRequestSchema>;

export type ShopperRunInput = {
  goal: string;
  budgetCents?: number;
  passToken?: string;
  ip: string;
};
