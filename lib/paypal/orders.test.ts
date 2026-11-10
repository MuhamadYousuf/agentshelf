import { afterEach, describe, expect, it, vi } from "vitest";
import { captureOrder, createOrder, createVaultOrder, parsePayPalCapture } from "./orders";
import { resetPaypalTokenCacheForTests } from "./client";

vi.mock("@/lib/env", () => ({
  getPaypalConfiguration: () => ({ environment: "sandbox", clientId: "test-id", clientSecret: "test-secret" }),
}));

const tokenResponse = () => new Response(JSON.stringify({ access_token: "test-token", expires_in: 3_600 }), { status: 200 });
const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  resetPaypalTokenCacheForTests();
});

describe("PayPal order adapter", () => {
  it("creates a vaulted order without a purchase-unit payee and parses an auto-capture", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({
        id: "PAYPAL-VAULT-ORDER",
        status: "COMPLETED",
        purchase_units: [{ payments: { captures: [{
          id: "CAPTURE-VAULT-1",
          status: "COMPLETED",
          amount: { value: "48.00" },
          seller_receivable_breakdown: {
            gross_amount: { value: "48.00" },
            paypal_fee: { value: "1.69" },
            net_amount: { value: "46.31" },
          },
        }] } }],
      }, 201));
    vi.stubGlobal("fetch", fetchMock);

    const created = await createVaultOrder({
      requestId: "order-quote-vault",
      vaultId: "VAULT-1",
      items: [{ name: "Ceramic mug", quantity: 2, unitAmountCents: 2_400 }],
      totalCents: 4_800,
      description: "Ceramic mug",
      returnUrl: "https://shop.test/return",
      cancelUrl: "https://shop.test/cancel",
      referenceId: "quote-vault",
      customId: "our-order",
    });

    expect(created).toMatchObject({ id: "PAYPAL-VAULT-ORDER", status: "COMPLETED", capture: { captureId: "CAPTURE-VAULT-1", netCents: 4_631 } });
    const request = fetchMock.mock.calls[1]?.[1];
    expect(new Headers(request?.headers).get("PayPal-Request-Id")).toBe("order-quote-vault");
    const body = JSON.parse(String(request?.body)) as {
      purchase_units: Array<Record<string, unknown>>;
      payment_source: { paypal: { vault_id: string } };
    };
    expect(body.payment_source.paypal.vault_id).toBe("VAULT-1");
    expect(body.purchase_units[0]).not.toHaveProperty("payee");
    expect(body.purchase_units[0]?.amount).toMatchObject({ value: "48.00", breakdown: { item_total: { value: "48.00" } } });
  });

  it("builds the item total request and parses the approval link", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({
        id: "PAYPAL-ORDER-1",
        status: "PAYER_ACTION_REQUIRED",
        links: [{ rel: "payer-action", href: "https://paypal.test/approve" }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const created = await createOrder({
      requestId: "order-quote-1",
      payeeEmail: "shop@example.test",
      items: [{ name: "Ceramic mug", quantity: 2, unitAmountCents: 2_400, description: "Hand-glazed mug" }],
      totalCents: 4_800,
      description: "Ceramic mug",
      returnUrl: "https://shop.test/api/paypal/return?order=our-order",
      cancelUrl: "https://shop.test/api/paypal/cancel?order=our-order",
      referenceId: "quote-1",
      customId: "our-order",
    });

    expect(created).toEqual({ id: "PAYPAL-ORDER-1", approveUrl: "https://paypal.test/approve" });
    const request = fetchMock.mock.calls[1]?.[1];
    expect(request?.method).toBe("POST");
    expect(new Headers(request?.headers).get("PayPal-Request-Id")).toBe("order-quote-1");
    const body = JSON.parse(String(request?.body)) as {
      intent: string;
      purchase_units: Array<{
        payee: { email_address: string };
        amount: { value: string; breakdown: { item_total: { value: string } } };
      }>;
      payment_source: { paypal: { experience_context: Record<string, string> } };
    };
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchase_units[0]?.payee.email_address).toBe("shop@example.test");
    expect(body.purchase_units[0]?.amount).toEqual({
      currency_code: "USD",
      value: "48.00",
      breakdown: { item_total: { currency_code: "USD", value: "48.00" } },
    });
    expect(body.payment_source.paypal.experience_context).toMatchObject({
      brand_name: "AgentShelf",
      user_action: "PAY_NOW",
      shipping_preference: "GET_FROM_FILE",
    });
  });

  it("parses capture fee, net, payer and shipping fields", () => {
    expect(parsePayPalCapture({
      id: "PAYPAL-ORDER-2",
      payer: { email_address: "buyer@example.test" },
      purchase_units: [{
        shipping: {
          name: { full_name: "Test Buyer" },
          address: { address_line_1: "1 Test Road", admin_area_2: "Lahore", country_code: "PK" },
        },
        payments: { captures: [{
          id: "CAPTURE-2",
          status: "COMPLETED",
          amount: { value: "48.00" },
          seller_receivable_breakdown: {
            gross_amount: { value: "48.00" },
            paypal_fee: { value: "1.69" },
            net_amount: { value: "46.31" },
          },
        }] },
      }],
    })).toEqual({
      captureId: "CAPTURE-2",
      status: "COMPLETED",
      grossCents: 4_800,
      feeCents: 169,
      netCents: 4_631,
      payerEmail: "buyer@example.test",
      shipping: {
        name: "Test Buyer",
        address: { addressLine1: "1 Test Road", city: "Lahore", countryCode: "PK" },
      },
    });
  });

  it("recovers ORDER_ALREADY_CAPTURED by fetching the completed order", async () => {
    const existingOrder = {
      id: "PAYPAL-ORDER-3",
      purchase_units: [{ payments: { captures: [{
        id: "CAPTURE-3",
        status: "COMPLETED",
        amount: { value: "10.00" },
        seller_receivable_breakdown: {
          gross_amount: { value: "10.00" },
          paypal_fee: { value: "0.69" },
          net_amount: { value: "9.31" },
        },
      }] } }],
    };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({
        name: "UNPROCESSABLE_ENTITY",
        details: [{ issue: "ORDER_ALREADY_CAPTURED" }],
      }, 422))
      .mockResolvedValueOnce(jsonResponse(existingOrder));
    vi.stubGlobal("fetch", fetchMock);

    const capture = await captureOrder("PAYPAL-ORDER-3", "capture-our-order");
    expect(capture.captureId).toBe("CAPTURE-3");
    expect(capture.status).toBe("COMPLETED");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("GET");
  });
});
