import { afterEach, describe, expect, it, vi } from "vitest";
import { createPayout } from "./payouts";
import { resetPaypalTokenCacheForTests } from "./client";

vi.mock("@/lib/env", () => ({
  getPaypalConfiguration: () => ({ environment: "sandbox", clientId: "test-id", clientSecret: "test-secret" }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  resetPaypalTokenCacheForTests();
});

describe("PayPal payout adapter", () => {
  it("uses the PayPal batch response shape and sends a USD email payout", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-token", expires_in: 3_600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        batch_header: { payout_batch_id: "PAYOUT-BATCH-1", batch_status: "PENDING" },
        links: [{ rel: "self", href: "https://api.paypal.test/v1/payments/payouts/PAYOUT-BATCH-1" }],
      }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPayout({
      requestId: "release-order-1",
      receiverEmail: "merchant@example.test",
      amountCents: 2_451,
      note: "Net proceeds",
    });

    expect(result.batch_header).toMatchObject({ payout_batch_id: "PAYOUT-BATCH-1", batch_status: "PENDING" });
    const request = fetchMock.mock.calls[1]?.[1];
    expect(new Headers(request?.headers).get("PayPal-Request-Id")).toBe("release-order-1");
    expect(JSON.parse(String(request?.body))).toMatchObject({
      sender_batch_header: { sender_batch_id: "release-order-1" },
      items: [{
        recipient_type: "EMAIL",
        amount: { value: "24.51", currency: "USD" },
        receiver: "merchant@example.test",
        sender_item_id: "release-order-1",
      }],
    });
  });
});
