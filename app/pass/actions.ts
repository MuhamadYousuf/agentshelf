"use server";

import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAppUrl } from "@/lib/env";
import { getDb } from "@/lib/db";
import { buyerPasses, events } from "@/lib/db/schema";
import { createSetupToken } from "@/lib/paypal/vault";
import { rememberPassOwner } from "@/lib/passes/owner";
import { sha256 } from "@/lib/passes/security";
import { consumeFixedWindowLimit } from "@/lib/security/ratelimit";

const categories = [
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

function readCents(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || !/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim())) return undefined;
  const parsed = Math.round(Number(value.trim()) * 100);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

const passFormSchema = z.object({
  label: z.string().trim().min(2).max(48),
  perOrderMaxCents: z.number().int().positive().max(100_000_000),
  totalBudgetCents: z.number().int().positive().max(500_000_000),
  stepUpOverCents: z.number().int().positive(),
  expiresDays: z.union([z.literal(1), z.literal(7), z.literal(30)]),
  categories: z.array(z.enum(categories)).min(1),
});

export async function createAgentPass(formData: FormData): Promise<void> {
  const raw = passFormSchema.safeParse({
    label: formData.get("label"),
    perOrderMaxCents: readCents(formData.get("perOrderMax")),
    totalBudgetCents: readCents(formData.get("totalBudget")),
    stepUpOverCents: readCents(formData.get("stepUpOver")),
    expiresDays: Number(formData.get("expiresDays")),
    categories: formData.getAll("categories").filter((value): value is string => typeof value === "string"),
  });
  if (!raw.success || raw.data.stepUpOverCents > raw.data.perOrderMaxCents ||
      raw.data.perOrderMaxCents > raw.data.totalBudgetCents) {
    redirect("/pass?error=details");
  }

  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const clientIp = forwardedFor || requestHeaders.get("x-real-ip") || "unknown";
  const clientKey = createHash("sha256").update(clientIp).digest("hex");
  let passCreationLimit: Awaited<ReturnType<typeof consumeFixedWindowLimit>>;
  try {
    passCreationLimit = await consumeFixedWindowLimit({
      key: `pass-create:${clientKey}`,
      limit: 5,
      windowMs: 60 * 60_000,
    });
  } catch {
    redirect("/pass?error=setup");
  }
  if (!passCreationLimit.allowed) redirect("/pass?error=rate");

  const ownerKey = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + raw.data.expiresDays * 24 * 60 * 60_000);
  const [pass] = await getDb().insert(buyerPasses).values({
    label: raw.data.label,
    ownerKeyHash: sha256(ownerKey),
    mandate: {
      perOrderMaxCents: raw.data.perOrderMaxCents,
      totalBudgetCents: raw.data.totalBudgetCents,
      expiresAt: expiresAt.toISOString(),
      categories: raw.data.categories,
      stepUpOverCents: raw.data.stepUpOverCents,
    },
    createdAt: now,
    updatedAt: now,
  }).returning({ id: buyerPasses.id });
  if (!pass) redirect("/pass?error=setup");

  let approveUrl: string;
  try {
    const appUrl = getAppUrl().replace(/\/+$/, "");
    const setup = await createSetupToken({
      requestId: `pass-setup-${pass.id}`,
      returnUrl: `${appUrl}/api/pass/return?pass=${encodeURIComponent(pass.id)}`,
      cancelUrl: `${appUrl}/api/pass/cancel?pass=${encodeURIComponent(pass.id)}`,
    });
    await getDb().update(buyerPasses).set({ setupTokenId: setup.id, updatedAt: new Date() })
      .where(eq(buyerPasses.id, pass.id));
    approveUrl = setup.approveUrl;
    await rememberPassOwner({ passId: pass.id, ownerKey });
  } catch {
    const db = getDb();
    await db.update(buyerPasses).set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(buyerPasses.id, pass.id), eq(buyerPasses.status, "pending_vault")));
    await db.insert(events).values({
      type: "pass.setup_failed",
      source: "system",
      payload: { passId: pass.id },
    }).catch(() => undefined);
    redirect("/pass?error=setup");
  }

  redirect(approveUrl);
}
