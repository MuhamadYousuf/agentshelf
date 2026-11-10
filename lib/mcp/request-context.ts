import "server-only";

import { createHash } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { mcpClients } from "@/lib/db/schema";

const CLIENT_CONTEXT_TTL_MS = 30 * 60_000;

export type McpRequestContext = {
  ip: string;
  agentClient: string;
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
  if (!request) return { ip, agentClient: "mcp-client" };

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
      return { ip, agentClient: name };
    }

    const [stored] = await db.select({ clientName: mcpClients.clientName })
      .from(mcpClients)
      .where(and(eq(mcpClients.fingerprint, fingerprint), gt(mcpClients.expiresAt, now)))
      .limit(1);
    return { ip, agentClient: stored?.clientName ?? "mcp-client" };
  } catch {
    return { ip, agentClient: "mcp-client" };
  }
}
