import { shopperEventSchema, type ShopperEvent } from "./shopper-events";
import { shopperRequestSchema, type ShopperRunInput } from "./shopper-input";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Content-Type-Options": "nosniff",
};

export function isAllowedShopperOrigin(
  origin: string | null,
  appUrl: string,
  development: boolean,
): boolean {
  if (!origin) return false;
  try {
    const parsedOrigin = new URL(origin);
    const configuredOrigin = new URL(appUrl).origin;
    if (parsedOrigin.origin === configuredOrigin) return true;
    if (!development || parsedOrigin.protocol !== "http:") return false;
    return ["localhost", "127.0.0.1", "[::1]"].includes(parsedOrigin.hostname);
  } catch {
    return false;
  }
}

export type ShopperPostHandlerDependencies = {
  appUrl: string;
  development: boolean;
  getClientIp(request: Request): string;
  consumeRunLimit(ip: string): Promise<boolean>;
  acquireRunLock(ip: string): Promise<(() => Promise<void>) | undefined>;
  run(input: ShopperRunInput): AsyncGenerator<ShopperEvent>;
};

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: noStoreHeaders });
}

export function createShopperPostHandler(dependencies: ShopperPostHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    if (!isAllowedShopperOrigin(request.headers.get("origin"), dependencies.appUrl, dependencies.development)) {
      return jsonError("Please open the Shopper Agent from AgentShelf and try again.", 403);
    }

    let requestBody: unknown;
    try {
      const contentLength = Number(request.headers.get("content-length") ?? "0");
      if (contentLength > 8_192) return jsonError("That request is too large. Shorten the shopping goal and try again.", 413);
      requestBody = await request.json();
    } catch {
      return jsonError("Please send a valid shopping request.", 400);
    }

    const parsed = shopperRequestSchema.safeParse(requestBody);
    if (!parsed.success) return jsonError("Please check the shopping goal, budget, and Agent Pass key.", 400);

    const ip = dependencies.getClientIp(request);
    let allowed: boolean;
    try {
      allowed = await dependencies.consumeRunLimit(ip);
    } catch {
      return jsonError("The Shopper Agent is temporarily unavailable. Please try again shortly.", 503);
    }
    if (!allowed) return jsonError("You've reached the shopping run limit. Please try again in a few minutes.", 429);

    let releaseLock: (() => Promise<void>) | undefined;
    try {
      releaseLock = await dependencies.acquireRunLock(ip);
    } catch {
      return jsonError("The Shopper Agent is temporarily unavailable. Please try again shortly.", 503);
    }
    if (!releaseLock) return jsonError("A shopping run is already in progress from this connection.", 429);

    const shopperInput: ShopperRunInput = {
      goal: parsed.data.goal,
      ip,
      ...(parsed.data.budget_cents !== undefined ? { budgetCents: parsed.data.budget_cents } : {}),
      ...(parsed.data.pass_token !== undefined ? { passToken: parsed.data.pass_token } : {}),
    };
    const encoder = new TextEncoder();
    const iterator = dependencies.run(shopperInput);
    let released = false;
    let cancelled = false;
    const release = async () => {
      if (released) return;
      released = true;
      try {
        await releaseLock?.();
      } catch {
        // The lock has a short expiry as a fallback if cleanup cannot reach the database.
      }
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: ShopperEvent) => {
          if (cancelled) return;
          const safeEvent = shopperEventSchema.parse(event);
          controller.enqueue(encoder.encode(`${JSON.stringify(safeEvent)}\n`));
        };
        try {
          for await (const event of iterator) send(event);
        } catch {
          try {
            send({ type: "error", message: "I couldn't complete that shopping run. Please try again." });
          } catch {
            // The client may have disconnected while the final event was being written.
          }
        } finally {
          await release();
          if (!cancelled) {
            try {
              controller.close();
            } catch {
              // The stream was already cancelled by the client.
            }
          }
        }
      },
      async cancel() {
        cancelled = true;
        try {
          await iterator.return(undefined);
        } catch {
          // The invocation will stop at its next awaited boundary.
        } finally {
          await release();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...noStoreHeaders,
        "Content-Type": "application/x-ndjson; charset=utf-8",
      },
    });
  };
}
