import type { McpRequestContext, ResolvedAgentPass } from "./request-context";

/** An optional invalid/revoked bearer never grants Flow B and falls back to approval checkout. */
export function optionalAgentPass(context: Pick<McpRequestContext, "agentPass" | "passAuth">): ResolvedAgentPass | undefined {
  if (context.passAuth !== "valid") return undefined;
  return context.agentPass;
}
