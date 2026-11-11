import { describe, expect, it, vi } from "vitest";
import { delegateToolkitMethod, paypalRequestId, ToolkitMethodError, ToolkitResultError } from "./toolkit-bridge";

describe("PayPal Agent Toolkit compatibility bridge", () => {
  it("delegates the exact mapped arguments and strips access-token fields", async () => {
    const input = {
      transaction_id: "capture-123",
      tracking_number: "1Z999AA10123456784",
      carrier: "UPS",
      status: "SHIPPED",
    };
    const execute = vi.fn(async (received: unknown) => ({
      received,
      status: "SUCCESS",
      access_token: "test-access-token",
      nested: { client_secret: "test-client-secret", id: "tracking-1" },
    }));
    const result = await delegateToolkitMethod({ create_shipment_tracking: { execute } }, "create_shipment_tracking", input);

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(input);
    expect(result).toEqual({ received: input, status: "SUCCESS", nested: { id: "tracking-1" } });
    expect(JSON.stringify(result)).not.toContain("test-access-token");
    expect(JSON.stringify(result)).not.toContain("test-client-secret");
  });

  it("treats the toolkit's returned error strings as failures, not success", async () => {
    const swallowed = vi.fn(async () => JSON.stringify({ error: { message: "Request failed with status code 403", type: "paypal_error" } }));
    await expect(delegateToolkitMethod({ create_shipment_tracking: { execute: swallowed } }, "create_shipment_tracking", {}))
      .rejects.toBeInstanceOf(ToolkitResultError);

    const paypalError = vi.fn(async () => JSON.stringify({ name: "PERMISSION_DENIED", message: "No permission", debug_id: "abc123" }));
    await expect(delegateToolkitMethod({ create_refund: { execute: paypalError } }, "create_refund", {}))
      .rejects.toMatchObject({ debugId: "abc123", paypalName: "PERMISSION_DENIED" });

    const batchRefused = vi.fn(async () => JSON.stringify({
      tracker_identifiers: [],
      errors: [{ name: "NOT_AUTHORIZED", message: "Authorization failed due to insufficient permissions" }],
    }));
    await expect(delegateToolkitMethod({ create_shipment_tracking: { execute: batchRefused } }, "create_shipment_tracking", {}))
      .rejects.toMatchObject({ paypalName: "NOT_AUTHORIZED" });

    const ok = vi.fn(async () => JSON.stringify({ id: "refund-1", status: "COMPLETED" }));
    await expect(delegateToolkitMethod({ create_refund: { execute: ok } }, "create_refund", {}))
      .resolves.toEqual({ id: "refund-1", status: "COMPLETED" });
  });

  it("returns a friendly error for unavailable methods", async () => {
    await expect(delegateToolkitMethod({}, "create_refund", { capture_id: "capture-1" }))
      .rejects.toBeInstanceOf(ToolkitMethodError);
  });

  it("creates a stable, bounded request id", () => {
    const first = paypalRequestId("refund", "order-1");
    expect(first).toBe(paypalRequestId("refund", "order-1"));
    expect(first.length).toBeLessThanOrEqual(38);
    expect(first).not.toContain("secret");
  });
});
