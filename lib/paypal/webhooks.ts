import "server-only";

import { getPaypalConfiguration } from "@/lib/env";
import { paypalFetch } from "./client";

export class PayPalWebhookConfigurationError extends Error {
  constructor() {
    super("PayPal webhook verification is not configured.");
    this.name = "PayPalWebhookConfigurationError";
  }
}

export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = getPaypalConfiguration().webhookId;
  if (!webhookId) throw new PayPalWebhookConfigurationError();

  let event: unknown;
  try {
    event = JSON.parse(rawBody) as unknown;
  } catch {
    return false;
  }

  const headerFields = [
    ["auth_algo", "paypal-auth-algo"],
    ["cert_url", "paypal-cert-url"],
    ["transmission_id", "paypal-transmission-id"],
    ["transmission_sig", "paypal-transmission-sig"],
    ["transmission_time", "paypal-transmission-time"],
  ] as const;
  const transmission: Record<string, string> = {};
  for (const [field, header] of headerFields) {
    const value = headers.get(header);
    if (!value) return false;
    transmission[field] = value;
  }

  const response = await paypalFetch<{ verification_status?: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: { ...transmission, webhook_id: webhookId, webhook_event: event },
    },
  );
  return response.verification_status === "SUCCESS";
}
