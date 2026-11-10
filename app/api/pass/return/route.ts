import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { buyerPasses, events } from "@/lib/db/schema";
import { isPassOwner, setPassFlash } from "@/lib/passes/owner";
import { sha256 } from "@/lib/passes/security";
import { createPaymentToken } from "@/lib/paypal/vault";

const passIdSchema = z.uuid();

function redirectToPass(request: Request, passId: string, query: string): Response {
  return NextResponse.redirect(new URL(`/pass/${passId}${query}`, request.url), 303);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  console.info("PayPal Agent Pass return query keys:", [...url.searchParams.keys()].sort());
  const passId = url.searchParams.get("pass");
  if (!passId || !passIdSchema.safeParse(passId).success) return new Response("Pass not found.", { status: 404 });

  const [pass] = await getDb().select().from(buyerPasses).where(eq(buyerPasses.id, passId)).limit(1);
  if (!pass || !(await isPassOwner(pass.id, pass.ownerKeyHash))) return new Response("Pass not found.", { status: 404 });

  // Vault redirects have used different setup-token parameter names across PayPal experiences.
  // Accept only a value equal to the setup token stored before the redirect.
  const returnedSetupToken = url.searchParams.get("approval_token_id") ??
    url.searchParams.get("setup_token_id") ??
    url.searchParams.get("token");
  if (!pass.setupTokenId || !returnedSetupToken || returnedSetupToken !== pass.setupTokenId) {
    return redirectToPass(request, pass.id, "?error=approval");
  }
  if (pass.status === "active") return redirectToPass(request, pass.id, "?created=1");
  if (pass.status !== "pending_vault") return redirectToPass(request, pass.id, "?error=approval");

  try {
    const paymentToken = await createPaymentToken({
      requestId: `pass-token-${pass.id}`,
      setupTokenId: pass.setupTokenId,
    });
    const rawToken = `asp_${randomBytes(32).toString("base64url")}`;
    const [activated] = await getDb().update(buyerPasses).set({
      vaultId: paymentToken.vaultId,
      paypalCustomerId: paymentToken.customerId,
      payerEmail: paymentToken.payerEmail,
      tokenHash: sha256(rawToken),
      status: "active",
      updatedAt: new Date(),
    }).where(and(
      eq(buyerPasses.id, pass.id),
      eq(buyerPasses.setupTokenId, pass.setupTokenId),
      eq(buyerPasses.status, "pending_vault"),
    )).returning({ id: buyerPasses.id });
    if (!activated) return redirectToPass(request, pass.id, "?error=already-claimed");

    await getDb().insert(events).values({
      type: "pass.activated",
      source: "system",
      payload: { passId: pass.id, expiresAt: pass.mandate.expiresAt },
    }).catch(() => undefined);
    await setPassFlash(pass.id, rawToken);
    return redirectToPass(request, pass.id, "?created=1");
  } catch {
    return redirectToPass(request, pass.id, "?error=approval");
  }
}
