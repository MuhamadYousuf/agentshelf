import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { buyerPasses, events } from "@/lib/db/schema";
import { isPassOwner } from "@/lib/passes/owner";

const passIdSchema = z.uuid();

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const passId = url.searchParams.get("pass");
  if (!passId || !passIdSchema.safeParse(passId).success) return new Response("Pass not found.", { status: 404 });
  const [pass] = await getDb().select().from(buyerPasses).where(eq(buyerPasses.id, passId)).limit(1);
  if (!pass || !(await isPassOwner(pass.id, pass.ownerKeyHash))) return new Response("Pass not found.", { status: 404 });

  const [cancelled] = await getDb().update(buyerPasses).set({
    status: "revoked",
    revokedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(buyerPasses.id, pass.id), eq(buyerPasses.status, "pending_vault")))
    .returning({ id: buyerPasses.id });
  if (cancelled) {
    await getDb().insert(events).values({
      type: "pass.setup_cancelled",
      source: "system",
      payload: { passId: pass.id },
    }).catch(() => undefined);
  }
  return NextResponse.redirect(new URL("/pass?cancelled=1", request.url), 303);
}
