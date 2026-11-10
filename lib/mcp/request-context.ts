import "server-only";

import { createHash } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { buyerPasses, mcpClients, type PassMandate } from "@/lib/db/schema";
import { isAgentPassToken, sha256 } from "@/lib/passes/security";

const CLIENT_CONTEXT_TTL_MS = 30 * 60_000;

export type McpRequestContext = {
  ip: string;
  agentClient: string;
  passAuth?: "none" | "invalid" | "valid";
  agentPass?: {
    id: string;
    vaultId: string;
    mandate: PassMandate;
    spentCents: number;
    pendingCents: number;
  };
};

export function getMcpClientIp(request: Request | undefined): string {
  const forwarded = request?.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwarded || "local";
}

export function sanitizeAgentClientName(value: unknown): string {
  if (typeof value !== "string") return "mcp-client";
  const safe = value.replace(/[^\w .-]/g, "").trim().slice(0, 40);
  return safe.length > 0 ? safe : "mcp-client";
}

function requestFingerprint(request: Request, ip: string): string {
  const userAgent = request.headers.get("user-agent") ?? "";
  return createHash("sha256").update(`${ip}\n${userAgent}`).digest("hex");
}

async function clientNameFromBody(request: Request): Promise<string | undefined> {
  try {
    const body: unknown = await request.clone().json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
    const params = (body as Record<string, unknown>).params;
    if (!params || typeof params !== "object" || Array.isArray(params)) return undefined;
    const clientInfo = (params as Record<string, unknown>).clientInfo;
    if (!clientInfo || typeof clientInfo !== "object" || Array.isArray(clientInfo)) return undefined;
    const name = (clientInfo as Record<string, unknown>).name;
    return typeof name === "string" ? sanitizeAgentClientName(name) : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveMcpRequestContext(request?: Request): Promise<McpRequestContext> {
  const ip = getMcpClientIp(request);
  if (!request) return { ip, agentClient: "mcp-client", passAuth: "none" };

  let passAuth: McpRequestContext["passAuth"] = request.headers.has("authorization") ? "invalid" : "none";
  let agentPass: McpRequestContext["agentPass"];
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (token && isAgentPassToken(token)) {
      try {
        const tokenHash = sha256(token);
        const [pass] = await getDb().select({
          id: buyerPasses.id,
          vaultId: buyerPasses.vaultId,
          mandate: buyerPasses.mandate,
          spentCents: buyerPasses.spentCents,
          pendingCents: buyerPasses.pendingCents,
        }).from(buyerPasses).where(and(
          eq(buyerPasses.tokenHash, tokenHash),
          eq(buyerPasses.status, "active"),
          isNull(buyerPasses.revokedAt),
        )).limit(1);
        if (pass?.vaultId && new Date(pass.mandate.expiresAt).getTime() > Date.now()) {
          passAuth = "valid";
          agentPass = {
            id: pass.id,
            vaultId: pass.vaultId,
            mandate: pass.mandate,
            spentCents: pass.spentCents,
            pendingCents: pass.pendingCents,
          };
        }
      } catch {
        passAuth = "invalid";
      }
    }
  }

  let agentClient = "mcp-client";
  try {
    const name = await clientNameFromBody(request);
    const fingerprint = requestFingerprint(request, ip);
    const now = new Date();
    const db = getDb();

    if (name) {
      await db.delete(mcpClients).where(lt(mcpClients.expiresAt, now));
      await db.insert(mcpClients).values({
        fingerprint,
        clientName: name,
        expiresAt: new Date(now.getTime() + CLIENT_CONTEXT_TTL_MS),
        updatedAt: now,
      }).onConflictDoUpdate({
        target: mcpClients.fingerprint,
        set: {
          clientName: name,
          expiresAt: new Date(now.getTime() + CLIENT_CONTEXT_TTL_MS),
          updatedAt: now,
        },
      });
      agentClient = name;
    } else {
      const [stored] = await db.select({ clientName: mcpClients.clientName })
        .from(mcpClients)
        .where(and(eq(mcpClients.fingerprint, fingerprint), gt(mcpClients.expiresAt, now)))
        .limit(1);
      agentClient = stored?.clientName ?? "mcp-client";
    }
  } catch {
    agentClient = "mcp-client";
  }
  return { ip, agentClient, passAuth, ...(agentPass ? { agentPass } : {}) };
}
