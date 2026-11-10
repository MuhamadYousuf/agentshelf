"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { buyerPasses, events } from "@/lib/db/schema";
import { isPassOwner } from "@/lib/passes/owner";
import { deletePaymentToken } from "@/lib/paypal/vault";

export async function revokeAgentPass(passId: string): Promise<void> {
  const [pass] = await getDb().select().from(buyerPasses).where(eq(buyerPasses.id, passId)).limit(1);
  if (!pass || !(await isPassOwner(pass.id, pass.ownerKeyHash))) return;
  if (pass.status !== "active" && pass.status !== "pending_vault") return;

  const [revoked] = await getDb().update(buyerPasses).set({
    status: "revoked",
    revokedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(buyerPasses.id, pass.id), eq(buyerPasses.status, pass.status)))
    .returning({ id: buyerPasses.id });
  if (!revoked) return;

  let vaultRemoved = "not-applicable";
  if (pass.vaultId) {
    try {
      await deletePaymentToken({ requestId: `pass-revoke-${pass.id}`, vaultId: pass.vaultId });
      vaultRemoved = "requested";
    } catch {
      vaultRemoved = "pending";
    }
  }
  await getDb().insert(events).values({
    type: "pass.revoked",
    source: "system",
    payload: { passId: pass.id, vaultRemoval: vaultRemoved },
  }).catch(() => undefined);
  revalidatePath(`/pass/${pass.id}`);
}
