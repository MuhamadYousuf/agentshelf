import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchants } from "@/lib/db/schema";
import { slugify } from "@/lib/slug";

export async function createUniqueMerchantSlug(name: string): Promise<string> {
  const db = getDb();
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const [match] = await db
      .select({ id: merchants.id })
      .from(merchants)
      .where(eq(merchants.slug, candidate))
      .limit(1);

    if (!match) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}
