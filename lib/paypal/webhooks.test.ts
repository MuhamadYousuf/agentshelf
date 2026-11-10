import { afterEach, describe, expect, it, vi } from "vitest";
import { PayPalWebhookConfigurationError, verifyWebhook } from "./webhooks";
import { resetPaypalTokenCacheForTests } from "./client";

const mockConfig = vi.hoisted(() => ({ webhookId: "webhook-test-id" as string | undefined }));
vi.mock("@/lib/env", () => ({
  getPaypalConfiguration: () => ({
    environment: "sandbox",
    clientId: "test-id",
    clientSecret: "test-secret",
    webhookId: mockConfig.webhookId,
  }),
}));

const tokenResponse = () => new Response(JSON.stringify({ access_token: "test-token", expires_in: 3_600 }), { status: 200 });
const headers = new Headers({
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.paypal.test/cert",
  "paypal-transmission-id": "tx-1",
  "paypal-transmission-sig": "signature",
  "paypal-transmission-time": "2026-11-10T12:00:00Z",
});

afterEach(() => {
  mockConfig.webhookId = "webhook-test-id";
  vi.unstubAllGlobals();
  resetPaypalTokenCacheForTests();
});

describe("PayPal webhook verification", () => {
  it("returns true only for SUCCESS and sends the raw event for verification", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ verification_status: "SUCCESS" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const raw = JSON.stringify({ id: "event-1", event_type: "PAYMENT.CAPTURE.COMPLETED" });

    await expect(verifyWebhook(headers, raw)).resolves.toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      auth_algo: "SHA256withRSA",
      transmission_id: "tx-1",
      webhook_id: "webhook-test-id",
      webhook_event: { id: "event-1" },
    });
  });

  it("returns false for a non-success signature response", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ verification_status: "FAILURE" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyWebhook(headers, "{}" )).resolves.toBe(false);
  });

  it("rejects missing webhook configuration without a PayPal request", async () => {
    mockConfig.webhookId = undefined;
    await expect(verifyWebhook(headers, "{}" )).rejects.toBeInstanceOf(PayPalWebhookConfigurationError);
  });

  it("rejects missing transmission headers", async () => {
    const missing = new Headers();
    await expect(verifyWebhook(missing, "{}" )).resolves.toBe(false);
  });
});
