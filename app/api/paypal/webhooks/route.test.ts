import { afterEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ webhookId: "test-webhook-id" as string | undefined }));
vi.mock("@/lib/env", () => ({
  getPaypalConfiguration: () => ({ environment: "sandbox", clientId: "test-id", clientSecret: "test-secret", webhookId: config.webhookId }),
}));
vi.mock("@/lib/commerce/inventory", () => ({
  expireStaleReservations: vi.fn(async () => 0),
  completeOrderOnce: vi.fn(async () => true),
  failOrderAndRelease: vi.fn(async () => true),
}));

import { POST } from "./route";

afterEach(() => {
  config.webhookId = "test-webhook-id";
  vi.restoreAllMocks();
});

describe("PayPal webhook route gates", () => {
  it("returns 503 if webhook verification is not configured", async () => {
    config.webhookId = undefined;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await POST(new Request("https://shop.test/api/paypal/webhooks", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for an unsigned request before database or PayPal calls", async () => {
    const response = await POST(new Request("https://shop.test/api/paypal/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "event-unsigned", event_type: "PAYMENT.CAPTURE.COMPLETED" }),
    }));
    expect(response.status).toBe(400);
  });
});
