"use server";

import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createUniqueMerchantSlug } from "@/lib/auth/merchant-slug";
import type { AuthActionState } from "@/lib/auth/types";
import { createSession, destroySession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { merchants } from "@/lib/db/schema";

const signupSchema = z.object({
  shopName: z.string().trim().min(2).max(80),
  email: z.email(),
  password: z.string().min(12).max(72),
  paypalEmail: z.email(),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(72),
});

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signupAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signupSchema.safeParse({
    shopName: readField(formData, "shopName"),
    email: readField(formData, "email").trim().toLowerCase(),
    password: readField(formData, "password"),
    paypalEmail: readField(formData, "paypalEmail").trim().toLowerCase(),
  });

  if (!parsed.success) {
    return { error: "Check your details and try again." };
  }

  let merchantId: string;
  try {
    const passwordHash = await hash(parsed.data.password, 12);
    const slug = await createUniqueMerchantSlug(parsed.data.shopName);
    const [merchant] = await getDb()
      .insert(merchants)
      .values({
        name: parsed.data.shopName,
        slug,
        email: parsed.data.email,
        passwordHash,
        paypalEmail: parsed.data.paypalEmail,
      })
      .returning({ id: merchants.id });

    if (!merchant) return { error: "We couldn't create your account. Try again." };
    merchantId = merchant.id;
    await createSession(merchantId);
  } catch {
    return { error: "We couldn't create your account. Check your details or sign in." };
  }

  redirect("/merchant");
}

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: readField(formData, "email").trim().toLowerCase(),
    password: readField(formData, "password"),
  });

  if (!parsed.success) {
    return { error: "Email or password is incorrect." };
  }

  try {
    const [merchant] = await getDb()
      .select({ id: merchants.id, passwordHash: merchants.passwordHash })
      .from(merchants)
      .where(eq(merchants.email, parsed.data.email))
      .limit(1);

    if (!merchant || !(await compare(parsed.data.password, merchant.passwordHash))) {
      return { error: "Email or password is incorrect." };
    }

    await createSession(merchant.id);
  } catch {
    return { error: "We couldn't sign you in. Try again in a moment." };
  }

  redirect("/merchant");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
