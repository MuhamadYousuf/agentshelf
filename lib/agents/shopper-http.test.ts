import { describe, expect, it, vi } from "vitest";
import { createShopperPostHandler, isAllowedShopperOrigin } from "./shopper-http";
import type { ShopperEvent } from "./shopper-events";

function request(body: unknown, origin = "https://agentshelf.test") {
  return new Request("https://agentshelf.test/api/shopper", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

function handler(options: { allowed?: boolean; lock?: boolean; run?: () => AsyncGenerator<ShopperEvent> } = {}) {
  const release = vi.fn(async () => undefined);
  const run = options.run ?? (async function* () {
    yield { type: "error", message: "No budget." } satisfies ShopperEvent;
  });
  const post = createShopperPostHandler({
    appUrl: "https://agentshelf.test",
    development: false,
    getClientIp: () => "198.51.100.20",
    consumeRunLimit: async () => options.allowed ?? true,
    acquireRunLock: async () => options.lock === false ? undefined : release,
    run: () => run(),
  });
  return { post, release };
}

describe("shopper streaming route handler", () => {
  it("rejects unknown request fields", async () => {
    const test = handler();
    const response = await test.post(request({ goal: "Find a mug under $30", budget_cents: 3000, extra: "no" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Please check the shopping goal, budget, and Agent Pass key." });
  });

  it("returns a friendly 429 when the run limit is reached", async () => {
    const test = handler({ allowed: false });
    const response = await test.post(request({ goal: "Find a mug under $30", budget_cents: 3000 }));
    expect(response.status).toBe(429);
    expect((await response.json()).error).toContain("shopping run limit");
  });

  it("returns a friendly 429 when another run is active", async () => {
    const test = handler({ lock: false });
    const response = await test.post(request({ goal: "Find a mug under $30", budget_cents: 3000 }));
    expect(response.status).toBe(429);
    expect((await response.json()).error).toContain("already in progress");
  });

  it("streams validated NDJSON and releases the concurrency lock", async () => {
    const test = handler();
    const response = await test.post(request({ goal: "Find a mug under $30", budget_cents: 3000 }));
    expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toBe('{"type":"error","message":"No budget."}\n');
    expect(test.release).toHaveBeenCalledTimes(1);
  });

  it("requires the configured origin, with localhost permitted only in development", () => {
    expect(isAllowedShopperOrigin("https://agentshelf.test", "https://agentshelf.test", false)).toBe(true);
    expect(isAllowedShopperOrigin("https://other.test", "https://agentshelf.test", false)).toBe(false);
    expect(isAllowedShopperOrigin("http://localhost:3000", "https://agentshelf.test", true)).toBe(true);
    expect(isAllowedShopperOrigin("http://localhost:3000", "https://agentshelf.test", false)).toBe(false);
    expect(isAllowedShopperOrigin(null, "https://agentshelf.test", true)).toBe(false);
  });
});
