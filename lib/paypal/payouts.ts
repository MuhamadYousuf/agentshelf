import "server-only";

import { paypalFetch } from "./client";

export type PayPalPayoutResponse = {
  batch_header?: {
    payout_batch_id?: string;
    batch_status?: string;
    sender_batch_header?: { sender_batch_id?: string };
  };
  links?: Array<{ href?: string; rel?: string; method?: string }>;
};

export async function createPayout(input: {
  requestId: string;
  receiverEmail: string;
  amountCents: number;
  note: string;
}): Promise<PayPalPayoutResponse> {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 1) {
    throw new Error("Payout amount must be a positive whole number of cents.");
  }
  return paypalFetch<PayPalPayoutResponse>("/v1/payments/payouts", {
    method: "POST",
    requestId: input.requestId,
    body: {
      sender_batch_header: {
        sender_batch_id: input.requestId,
        email_subject: "Your AgentShelf payout is on the way",
        email_message: input.note.slice(0, 1000),
      },
      items: [{
        recipient_type: "EMAIL",
        amount: { value: (input.amountCents / 100).toFixed(2), currency: "USD" },
        receiver: input.receiverEmail,
        note: input.note.slice(0, 1000),
        sender_item_id: input.requestId,
      }],
    },
  });
}
