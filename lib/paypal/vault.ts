import "server-only";

import { paypalFetch } from "./client";

type PayPalLink = { rel?: string; href?: string; method?: string };

export type SetupTokenResponse = {
  id?: string;
  customer?: { id?: string };
  links?: PayPalLink[];
};

export type PaymentTokenResponse = {
  id?: string;
  customer?: { id?: string };
  payment_source?: {
    paypal?: {
      email_address?: string;
      payer_id?: string;
    };
  };
  links?: PayPalLink[];
};

export async function createSetupToken(input: {
  requestId: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; approveUrl: string; customerId: string | null }> {
  const response = await paypalFetch<SetupTokenResponse>("/v3/vault/setup-tokens", {
    method: "POST",
    requestId: input.requestId,
    body: {
      payment_source: {
        paypal: {
          description: "AgentShelf Agent Pass — lets your AI agent pay within your limits",
          usage_pattern: "IMMEDIATE",
          usage_type: "MERCHANT",
          customer_type: "CONSUMER",
          permit_multiple_payment_tokens: true,
          experience_context: {
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
            brand_name: "AgentShelf",
            shipping_preference: "NO_SHIPPING",
            vault_instruction: "ON_PAYER_APPROVAL",
          },
        },
      },
    },
  });
  if (!response.id) throw new Error("PayPal did not return an Agent Pass setup token.");
  const approveUrl = response.links?.find((link) => link.rel === "approve" || link.rel === "payer-action")?.href;
  if (!approveUrl) throw new Error("PayPal did not return an Agent Pass approval link.");
  return { id: response.id, approveUrl, customerId: response.customer?.id ?? null };
}

export async function createPaymentToken(input: {
  requestId: string;
  setupTokenId: string;
}): Promise<{ vaultId: string; customerId: string | null; payerEmail: string | null }> {
  const response = await paypalFetch<PaymentTokenResponse>("/v3/vault/payment-tokens", {
    method: "POST",
    requestId: input.requestId,
    body: { payment_source: { token: { id: input.setupTokenId, type: "SETUP_TOKEN" } } },
  });
  if (!response.id) throw new Error("PayPal did not return an Agent Pass payment token.");
  return {
    vaultId: response.id,
    customerId: response.customer?.id ?? null,
    payerEmail: response.payment_source?.paypal?.email_address ?? null,
  };
}

export async function deletePaymentToken(input: {
  requestId: string;
  vaultId: string;
}): Promise<void> {
  await paypalFetch<unknown>(`/v3/vault/payment-tokens/${encodeURIComponent(input.vaultId)}`, {
    method: "DELETE",
    requestId: input.requestId,
  });
}
