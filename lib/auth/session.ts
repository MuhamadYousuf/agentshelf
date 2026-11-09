import "server-only";

import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSessionSecret } from "@/lib/env";
import { getDb } from "@/lib/db";
import { merchants } from "@/lib/db/schema";

const COOKIE_NAME = "agentshelf_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const ISSUER = "agentshelf";
const AUDIENCE = "merchant";

export type MerchantSession = {
  merchantId: string;
};

function signingKey(): Uint8Array {
  return new TextEncoder().encode(getSessionSecret());
}

export async function getSession(): Promise<MerchantSession | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ["HS256"],
      audience: AUDIENCE,
      issuer: ISSUER,
    });

    if (typeof payload.merchantId !== "string") return null;
    return { merchantId: payload.merchantId };
  } catch {
    return null;
  }
}

export async function requireMerchant() {
  const session = await getSession();
  if (!session) redirect("/merchant/login");

  const [merchant] = await getDb()
    .select({ id: merchants.id, name: merchants.name, slug: merchants.slug })
    .from(merchants)
    .where(eq(merchants.id, session.merchantId))
    .limit(1);

  if (!merchant) redirect("/merchant/login");
  return merchant;
}

export async function createSession(merchantId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ merchantId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_SECONDS)
    .sign(signingKey());

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
    expires: new Date((now + SESSION_SECONDS) * 1000),
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}
