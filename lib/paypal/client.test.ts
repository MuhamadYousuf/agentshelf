import { afterEach, describe, expect, it, vi } from "vitest";
import { paypalFetch, PayPalError, resetPaypalTokenCacheForTests } from "./client";

vi.mock("@/lib/env", () => ({
  getPaypalConfiguration: () => ({
    environment: "sandbox",
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
  }),
}));

const tokenResponse = () =>
  new Response(JSON.stringify({ access_token: "test-access-token", expires_in: 3_600 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("PayPal REST client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetPaypalTokenCacheForTests();
  });

  it("caches OAuth tokens until 60 seconds before expiry and sends PayPal headers", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "CAT-1" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "CAT-2" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "CAT-3" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access-token-2", expires_in: 3_600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "CAT-4" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await paypalFetch<{ id: string }>("/v1/catalogs/products", {
      method: "POST",
      body: { name: "Mug" },
      requestId: "catalog-test",
    });
    await paypalFetch<{ id: string }>("/v1/catalogs/products", { method: "GET" });
    now += 3_539_000;
    await paypalFetch<{ id: string }>("/v1/catalogs/products", { method: "GET" });
    now += 1_000;
    await paypalFetch<{ id: string }>("/v1/catalogs/products", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledTimes(6);
    const request = fetchMock.mock.calls[1];
    const headers = new Headers(request?.[1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-access-token");
    expect(headers.get("prefer")).toBe("return=representation");
    expect(headers.get("paypal-request-id")).toBe("catalog-test");
  });

  it("maps PayPal errors and preserves the debug id without leaking credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        name: "UNPROCESSABLE_ENTITY",
        message: "Request test-access-token test-client-secret could not be processed",
        details: [{ issue: "INVALID_REQUEST", description: "token test-access-token" }],
      }), {
        status: 422,
        headers: { "paypal-debug-id": "DEBUG-123" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = paypalFetch("/v1/catalogs/products", { method: "POST", body: {} });
    await expect(result).rejects.toMatchObject({
      name: "UNPROCESSABLE_ENTITY",
      status: 422,
      debugId: "DEBUG-123",
      message: "Request [redacted] [redacted] could not be processed",
    } satisfies Partial<PayPalError>);
    await expect(result).rejects.toMatchObject({
      details: [{ description: "token [redacted]" }],
    });
  });
});
