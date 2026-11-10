import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { buyerPasses } from "@/lib/db/schema";
import { isPassOwner, PASS_FLASH_COOKIE } from "@/lib/passes/owner";
import { isAgentPassToken, sha256 } from "@/lib/passes/security";

const bodySchema = z.object({ passId: z.uuid() }).strict();

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Pass token is unavailable." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Pass token is unavailable." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const [pass] = await getDb().select({
    id: buyerPasses.id,
    status: buyerPasses.status,
    tokenHash: buyerPasses.tokenHash,
    ownerKeyHash: buyerPasses.ownerKeyHash,
  }).from(buyerPasses).where(eq(buyerPasses.id, parsed.data.passId)).limit(1);
  if (!pass || pass.status !== "active" || !pass.tokenHash || !(await isPassOwner(pass.id, pass.ownerKeyHash))) {
    return Response.json({ error: "Pass token is unavailable." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const cookieStore = await cookies();
  const flashValue = cookieStore.get(PASS_FLASH_COOKIE)?.value;
  const prefix = `${pass.id}.`;
  const rawToken = flashValue?.startsWith(prefix) ? flashValue.slice(prefix.length) : undefined;
  cookieStore.delete(PASS_FLASH_COOKIE);
  if (!rawToken || !isAgentPassToken(rawToken) || sha256(rawToken) !== pass.tokenHash) {
    return Response.json({ error: "This pass key was already shown. Revoke the pass and create a new one if you did not save it." }, {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return Response.json({ token: rawToken }, { headers: { "Cache-Control": "no-store" } });
}
