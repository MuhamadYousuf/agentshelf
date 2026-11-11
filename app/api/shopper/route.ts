import { createShopperPostHandler } from "@/lib/agents/shopper-http";
import { createShopperDependencies, runShopper } from "@/lib/agents/shopper-agent";
import { acquireShopperRunLock } from "@/lib/agents/shopper-lock";
import { getMcpClientIp } from "@/lib/mcp/request-context";
import { getAppUrl } from "@/lib/env";
import { consumeFixedWindowLimit } from "@/lib/security/ratelimit";

export const maxDuration = 60;

const postShopper = createShopperPostHandler({
  appUrl: getAppUrl(),
  development: process.env.NODE_ENV !== "production",
  getClientIp: getMcpClientIp,
  consumeRunLimit: async (ip) => {
    const result = await consumeFixedWindowLimit({
      key: `shopper:run:${ip}`,
      limit: 6,
      windowMs: 10 * 60_000,
    });
    return result.allowed;
  },
  acquireRunLock: acquireShopperRunLock,
  run: (input) => runShopper(input, createShopperDependencies()),
});

export function POST(request: Request): Promise<Response> {
  return postShopper(request);
}
