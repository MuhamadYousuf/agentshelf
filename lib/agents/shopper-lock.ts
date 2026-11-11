import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { shopperRunLocks } from "@/lib/db/schema";

const RUN_LOCK_TTL_MS = 70_000;

export async function acquireShopperRunLock(
  ip: string,
  now = new Date(),
): Promise<(() => Promise<void>) | undefined> {
  const clientKey = createHash("sha256").update(ip).digest("hex");
  const runId = randomUUID();
  const expiresAt = new Date(now.getTime() + RUN_LOCK_TTL_MS);
  const [lock] = await getDb().insert(shopperRunLocks).values({
    clientKey,
    runId,
    expiresAt,
    createdAt: now,
  }).onConflictDoUpdate({
    target: shopperRunLocks.clientKey,
    set: { runId, expiresAt, createdAt: now },
    setWhere: lte(shopperRunLocks.expiresAt, now),
  }).returning({ runId: shopperRunLocks.runId });

  if (!lock) return undefined;
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await getDb().delete(shopperRunLocks).where(and(
      eq(shopperRunLocks.clientKey, clientKey),
      eq(shopperRunLocks.runId, runId),
    ));
  };
}
