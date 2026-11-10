import { afterEach, describe, expect, it, vi } from "vitest";
import { resetPaypalTokenCacheForTests } from "./client";
import { createPaymentToken, createSetupToken, deletePaymentToken } from "./vault";

vi.mock("@/lib/env", () => ({
  getPaypalConfiguration: () => ({ environment: "sandbox", clientId: "test-id", clientSecret: "test-secret" }),
}));

const tokenResponse = () => new Response(JSON.stringify({ access_token: "test-token", expires_in: 3_600 }), { status: 200 });
const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  resetPaypalTokenCacheForTests();
});

describe("PayPal Vault adapter", () => {
  it("creates a setup token using the spike's request and approval-link shape", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({
        id: "SETUP-1",
        customer: { id: "CUSTOMER-1" },
        links: [{ rel: "approve", href: "https://paypal.test/setup" }],
      }, 201));
    vi.stubGlobal("fetch", fetchMock);

    const created = await createSetupToken({
      requestId: "pass-1",
      returnUrl: "https://shop.test/api/pass/return?pass=pass-1",
      cancelUrl: "https://shop.test/pass?cancelled=1",
    });
    expect(created).toEqual({ id: "SETUP-1", approveUrl: "https://paypal.test/setup", customerId: "CUSTOMER-1" });
    const request = fetchMock.mock.calls[1]?.[1];
    expect(request?.method).toBe("POST");
    expect(new Headers(request?.headers).get("PayPal-Request-Id")).toBe("pass-1");
    const body = JSON.parse(String(request?.body)) as {
      payment_source: { paypal: { usage_pattern: string; usage_type: string; customer_type: string; experience_context: Record<string, string> } };
    };
    expect(body.payment_source.paypal).toMatchObject({
      usage_pattern: "IMMEDIATE",
      usage_type: "MERCHANT",
      customer_type: "CONSUMER",
    });
    expect(body.payment_source.paypal.experience_context).toMatchObject({
      return_url: "https://shop.test/api/pass/return?pass=pass-1",
      cancel_url: "https://shop.test/pass?cancelled=1",
      vault_instruction: "ON_PAYER_APPROVAL",
    });
  });

  it("exchanges a setup token and parses the payment token's customer and PayPal wallet", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({
        id: "VAULT-1",
        customer: { id: "CUSTOMER-1" },
        payment_source: { paypal: { email_address: "buyer@example.test", payer_id: "PAYER-1" } },
        links: [{ rel: "delete", href: "https://api-m.sandbox.paypal.com/v3/vault/payment-tokens/VAULT-1" }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPaymentToken({ requestId: "pass-token-1", setupTokenId: "SETUP-1" });
    expect(result).toEqual({ vaultId: "VAULT-1", customerId: "CUSTOMER-1", payerEmail: "buyer@example.test" });
    const request = fetchMock.mock.calls[1]?.[1];
    expect(new Headers(request?.headers).get("PayPal-Request-Id")).toBe("pass-token-1");
    expect(JSON.parse(String(request?.body))).toEqual({ payment_source: { token: { id: "SETUP-1", type: "SETUP_TOKEN" } } });
  });

  it("deletes a vaulted payment token with an idempotency key", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await deletePaymentToken({ requestId: "pass-revoke-1", vaultId: "VAULT-1" });
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe("https://api-m.sandbox.paypal.com/v3/vault/payment-tokens/VAULT-1");
    expect(init?.method).toBe("DELETE");
    expect(new Headers(init?.headers).get("PayPal-Request-Id")).toBe("pass-revoke-1");
  });
});
