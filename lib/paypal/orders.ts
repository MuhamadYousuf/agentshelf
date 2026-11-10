import "server-only";

import { PayPalError, paypalFetch } from "./client";
import type { OrderShipping } from "@/lib/db/schema";

export type PayPalOrderItem = {
  name: string;
  quantity: number;
  unitAmountCents: number;
  description?: string;
};

export type CreatePayPalOrderInput = {
  requestId: string;
  payeeEmail: string;
  items: PayPalOrderItem[];
  totalCents: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  referenceId: string;
  customId: string;
};

export type PayPalOrderResponse = {
  id: string;
  status?: string;
  links?: Array<{ href?: string; rel?: string; method?: string }>;
  purchase_units?: Array<Record<string, unknown>>;
  payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
  payment_source?: { paypal?: { email_address?: string } };
};

export type ParsedPayPalCapture = {
  captureId: string;
  status: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  payerEmail: string | null;
  shipping: OrderShipping | null;
};

function centsToPayPal(cents: number): string {
  return (cents / 100).toFixed(2);
}

function amountCents(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

export async function createOrder(input: CreatePayPalOrderInput): Promise<{ id: string; approveUrl: string }> {
  const itemsTotalCents = input.items.reduce((total, item) => total + item.quantity * item.unitAmountCents, 0);
  if (itemsTotalCents !== input.totalCents) throw new Error("PayPal item total must equal the order total.");
  if (input.items.length === 0 || input.items.some((item) => item.quantity < 1 || item.unitAmountCents < 1)) {
    throw new Error("PayPal orders need at least one priced item.");
  }

  const order = await paypalFetch<PayPalOrderResponse>("/v2/checkout/orders", {
    method: "POST",
    requestId: input.requestId,
    body: {
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: input.referenceId,
        custom_id: input.customId,
        description: input.description.slice(0, 127),
        payee: { email_address: input.payeeEmail },
        items: input.items.map((item) => ({
          name: item.name.slice(0, 127),
          ...(item.description ? { description: item.description.slice(0, 127) } : {}),
          quantity: String(item.quantity),
          unit_amount: { currency_code: "USD", value: centsToPayPal(item.unitAmountCents) },
          category: "PHYSICAL_GOODS",
        })),
        amount: {
          currency_code: "USD",
          value: centsToPayPal(input.totalCents),
          breakdown: { item_total: { currency_code: "USD", value: centsToPayPal(itemsTotalCents) } },
        },
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "AgentShelf",
            user_action: "PAY_NOW",
            shipping_preference: "GET_FROM_FILE",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
  });

  if (!order.id) throw new Error("PayPal did not return an order ID.");
  const approval = order.links?.find((link) => link.rel === "payer-action" || link.rel === "approve");
  if (!approval?.href) throw new Error("PayPal did not return an approval link.");
  return { id: order.id, approveUrl: approval.href };
}

export async function getOrder(id: string): Promise<PayPalOrderResponse> {
  return paypalFetch<PayPalOrderResponse>(`/v2/checkout/orders/${encodeURIComponent(id)}`, {
    method: "GET",
  });
}

export function parsePayPalCapture(order: PayPalOrderResponse): ParsedPayPalCapture {
  const purchaseUnit = order.purchase_units?.[0] ?? {};
  const unit = objectValue(purchaseUnit);
  const payments = objectValue(unit?.payments);
  const captures = Array.isArray(payments?.captures) ? payments.captures : [];
  const capture = objectValue(captures[0]);
  if (!capture || typeof capture.id !== "string" || typeof capture.status !== "string") {
    throw new Error("PayPal order does not contain a capture.");
  }
  const amount = objectValue(capture.amount);
  const breakdown = objectValue(capture.seller_receivable_breakdown);
  const gross = objectValue(breakdown?.gross_amount);
  const fee = objectValue(breakdown?.paypal_fee);
  const net = objectValue(breakdown?.net_amount);
  const source = objectValue(order.payment_source);
  const paypalSource = objectValue(source?.paypal);
  const payer = objectValue(order.payer);
  const shippingRaw = objectValue(unit?.shipping);
  const nameRaw = objectValue(shippingRaw?.name);
  const addressRaw = objectValue(shippingRaw?.address);

  const email = typeof paypalSource?.email_address === "string"
    ? paypalSource.email_address
    : typeof payer?.email_address === "string" ? payer.email_address : null;
  const address: OrderShipping["address"] = {};
  const addressFields: Array<[keyof OrderShipping["address"], string]> = [
    ["addressLine1", "address_line_1"],
    ["addressLine2", "address_line_2"],
    ["city", "admin_area_2"],
    ["state", "admin_area_1"],
    ["postalCode", "postal_code"],
    ["countryCode", "country_code"],
  ];
  for (const [destination, sourceKey] of addressFields) {
    const value = addressRaw?.[sourceKey];
    if (typeof value === "string") address[destination] = value;
  }

  return {
    captureId: capture.id,
    status: capture.status,
    grossCents: amountCents(gross?.value ?? amount?.value),
    feeCents: amountCents(fee?.value),
    netCents: amountCents(net?.value),
    payerEmail: email,
    shipping: shippingRaw ? {
      name: typeof nameRaw?.full_name === "string" ? nameRaw.full_name : null,
      address,
    } : null,
  };
}

function isAlreadyCaptured(error: unknown): boolean {
  if (!(error instanceof PayPalError) || error.status !== 422) return false;
  const details = Array.isArray(error.details) ? error.details : [];
  return details.some((entry) => objectValue(entry)?.issue === "ORDER_ALREADY_CAPTURED");
}

export async function captureOrder(id: string, requestId: string): Promise<ParsedPayPalCapture> {
  try {
    const order = await paypalFetch<PayPalOrderResponse>(
      `/v2/checkout/orders/${encodeURIComponent(id)}/capture`,
      { method: "POST", requestId, body: {} },
    );
    return parsePayPalCapture(order);
  } catch (error) {
    if (!isAlreadyCaptured(error)) throw error;
    return parsePayPalCapture(await getOrder(id));
  }
}
