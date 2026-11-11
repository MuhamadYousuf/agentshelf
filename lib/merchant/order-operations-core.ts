import { createHash } from "node:crypto";

export const orderTrackingCarriers = ["UPS", "USPS", "FEDEX", "DHL", "OTHER"] as const;
export type OrderTrackingCarrier = (typeof orderTrackingCarriers)[number];

export const trackingNumberPattern = /^[A-Z0-9-]{6,40}$/;

export function isValidTrackingNumber(value: string): boolean {
  return trackingNumberPattern.test(value);
}

export function makeTrackingUrl(carrier: OrderTrackingCarrier, trackingNumber: string): string | undefined {
  const number = encodeURIComponent(trackingNumber);
  switch (carrier) {
    case "UPS": return `https://www.ups.com/track?tracknum=${number}`;
    case "USPS": return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${number}`;
    case "FEDEX": return `https://www.fedex.com/fedextrack/?trknbr=${number}`;
    case "DHL": return `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${number}`;
    case "OTHER": return undefined;
  }
}

export function mapCreateShipmentTrackingArgs(input: {
  captureId: string;
  paypalOrderId: string | null;
  carrier: OrderTrackingCarrier;
  trackingNumber: string;
}): Record<string, unknown> {
  return {
    ...(input.paypalOrderId ? { order_id: input.paypalOrderId } : {}),
    transaction_id: input.captureId,
    tracking_number: input.trackingNumber,
    carrier: input.carrier,
    status: "SHIPPED",
  };
}

export function safeCopilotText(value: string, maxLength = 500): string {
  const cleaned = value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLength).trim();
}

export function stablePayPalRequestId(action: "tracking" | "refund", stableKey: string): string {
  const prefix = action === "tracking" ? "trk" : "ref";
  const digest = createHash("sha256").update(`${action}:${stableKey}`).digest("hex").slice(0, 32);
  return `${prefix}-${digest}`;
}
