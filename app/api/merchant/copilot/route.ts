import { getSession } from "@/lib/auth/session";
import { runCopilot, copilotMessageSchema } from "@/lib/agents/copilot";
import { consumeFixedWindowLimit } from "@/lib/security/ratelimit";

export const maxDuration = 30;

const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in to use Copilot." }, { status: 401, headers });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a valid Copilot request." }, { status: 400, headers });
  }
  const parsed = copilotMessageSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Write a short request for Copilot." }, { status: 400, headers });

  const limit = await consumeFixedWindowLimit({
    key: `merchant-copilot:${session.merchantId}`,
    limit: 20,
    windowMs: 10 * 60_000,
  });
  if (!limit.allowed) {
    return Response.json(
      { error: "Copilot is taking a short pause. Try again in a few minutes." },
      { status: 429, headers: { ...headers, "Retry-After": String(Math.max(1, Math.ceil((limit.resetsAt.getTime() - Date.now()) / 1_000))) } },
    );
  }

  try {
    const result = await runCopilot({ merchantId: session.merchantId, message: parsed.data.message });
    return Response.json(result, { headers });
  } catch {
    return Response.json({ error: "Copilot couldn't complete that request. Try again in a moment." }, { status: 500, headers });
  }
}
