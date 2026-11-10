import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

export function fixedWindowStart(nowMs: number, windowMs: number): number {
  if (!Number.isFinite(nowMs) || !Number.isFinite(windowMs) || windowMs <= 0) {
    throw new RangeError("A positive fixed-window duration and finite time are required.");
  }
  return Math.floor(nowMs / windowMs) * windowMs;
}

export async function consumeFixedWindowLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
  now?: Date;
}): Promise<{ allowed: boolean; count: number; resetsAt: Date }> {
  const { key, limit, windowMs, now = new Date() } = options;
  const windowStartMs = fixedWindowStart(now.getTime(), windowMs);
  const windowStart = new Date(windowStartMs);
  const [row] = await getDb()
    .insert(rateLimits)
    .values({ key, count: 1, windowStart })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.windowStart} = EXCLUDED.window_start THEN ${rateLimits.count} + 1 ELSE 1 END`,
        windowStart: sql`EXCLUDED.window_start`,
      },
    })
    .returning({ count: rateLimits.count });

  const count = row?.count ?? limit + 1;
  return {
    allowed: count <= limit,
    count,
    resetsAt: new Date(windowStartMs + windowMs),
  };
}
