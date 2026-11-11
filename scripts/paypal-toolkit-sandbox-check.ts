import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

import { and, desc, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db";
import { events, orders } from "@/lib/db/schema";
import { getPaypalConfiguration } from "@/lib/env";
import { addTrackingForMerchant, confirmRefundForMerchant, paypalToolkitDebugId } from "@/lib/merchant/order-operations";
import { executePaypalToolkitAction } from "@/lib/paypal/agent-toolkit";
import { stablePayPalRequestId } from "@/lib/merchant/order-operations-core";

type Candidate = {
  id: string;
  merchantId: string;
  flow: "approval_link" | "agent_pass";
  status: string;
  captureId: string | null;
  paypalOrderId: string | null;
};

type CheckResult = {
  action: string;
  orderId?: string;
  outcome: string;
  debugId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safePayPalFailure(error: unknown): Pick<CheckResult, "debugId"> & { status?: number; name?: string } {
  const response = isRecord(error) && isRecord(error.response) ? error.response : undefined;
  const statusValue = response?.status ?? (isRecord(error) ? error.status : undefined);
  const nameValue = response && isRecord(response.data) ? response.data.name : undefined;
  const debugId = paypalToolkitDebugId(error);
  return {
    ...(typeof statusValue === "number" ? { status: statusValue } : {}),
    ...(typeof nameValue === "string" ? { name: nameValue } : {}),
    ...(debugId ? { debugId } : {}),
  };
}

async function latestDebugId(type: "order.tracking_sync_failed" | "order.refund_failed", merchantId: string, orderId: string): Promise<string | undefined> {
  const rows = await getDb().select({ payload: events.payload }).from(events)
    .where(and(eq(events.type, type), eq(events.merchantId, merchantId))).orderBy(desc(events.createdAt)).limit(10);
  const match = rows.find((row) => row.payload.orderId === orderId);
  return typeof match?.payload.debugId === "string" ? match.payload.debugId : undefined;
}

async function run(): Promise<void> {
  const configuration = getPaypalConfiguration();
  if (configuration.environment !== "sandbox") {
    throw new Error("Refusing to run PayPal Toolkit checks unless PAYPAL_ENV=sandbox.");
  }
  const db = getDb();
  const candidates = await db.select({
    id: orders.id,
    merchantId: orders.merchantId,
    flow: orders.flow,
    status: orders.status,
    captureId: orders.captureId,
    paypalOrderId: orders.paypalOrderId,
  }).from(orders).where(eq(orders.status, "completed")).orderBy(desc(orders.createdAt));

  const flowA = candidates.find((row) => row.flow === "approval_link" && row.captureId) as Candidate | undefined;
  const flowB = candidates.find((row) => row.flow === "agent_pass" && row.captureId) as Candidate | undefined;
  const results: CheckResult[] = [];

  for (const [flowName, row] of [["Flow A", flowA], ["Flow B", flowB]] as const) {
    if (!row) {
      results.push({ action: `${flowName} tracking`, outcome: "Skipped: no completed sandbox order with a capture was available." });
      continue;
    }
    const trackingNumber = `P07-CHECK-${row.id.slice(0, 8).toUpperCase()}`;
    const tracking = await addTrackingForMerchant({
      merchantId: row.merchantId,
      orderId: row.id,
      carrier: "UPS",
      trackingNumber,
    });
    results.push({
      action: `${flowName} tracking`,
      orderId: row.id,
      outcome: tracking.message,
      ...(!tracking.paypalSynced ? { debugId: await latestDebugId("order.tracking_sync_failed", row.merchantId, row.id) } : {}),
    });
  }

  if (!flowA) {
    results.push({ action: "Flow A refund permission check", outcome: "Skipped: no completed sandbox order with a capture was available." });
  } else {
    try {
      await executePaypalToolkitAction("create_refund", {
        capture_id: flowA.captureId,
        note_to_payer: "AgentShelf P07 sandbox permission check",
      }, { requestId: stablePayPalRequestId("refund", `p07-flow-a:${flowA.id}`) });
      await db.update(orders).set({ status: "refunded", updatedAt: new Date() }).where(and(
        eq(orders.id, flowA.id), eq(orders.merchantId, flowA.merchantId), eq(orders.flow, "approval_link"), eq(orders.status, "completed"),
      ));
      await db.insert(events).values({
        merchantId: flowA.merchantId,
        type: "order.refunded",
        source: "system",
        payload: { orderId: flowA.id, source: "P07 sandbox permission check" },
      });
      results.push({ action: "Flow A refund permission check", orderId: flowA.id, outcome: "PayPal accepted the refund; the sandbox order was marked refunded locally." });
    } catch (error) {
      const failure = safePayPalFailure(error);
      results.push({
        action: "Flow A refund permission check",
        orderId: flowA.id,
        outcome: `PayPal refused the refund${failure.status ? ` (HTTP ${failure.status})` : ""}${failure.name ? `: ${failure.name}` : "."}`,
        ...(failure.debugId ? { debugId: failure.debugId } : {}),
      });
    }
  }

  if (!flowB) {
    results.push({ action: "Flow B refund", outcome: "Skipped: no completed sandbox Agent Pass order with a capture was available." });
  } else {
    const refund = await confirmRefundForMerchant({
      merchantId: flowB.merchantId,
      orderId: flowB.id,
      reason: "P07 sandbox Agent Toolkit verification",
    });
    results.push({
      action: "Flow B refund",
      orderId: flowB.id,
      outcome: refund.success ? refund.message : refund.message,
      ...(!refund.success ? { debugId: await latestDebugId("order.refund_failed", flowB.merchantId, flowB.id) } : {}),
    });
  }

  process.stdout.write(`${JSON.stringify({ environment: "sandbox", results }, null, 2)}\n`);
}

run().catch((error: unknown) => {
  const safe = safePayPalFailure(error);
  process.stderr.write(`${JSON.stringify({ error: "Sandbox verification could not run.", ...safe })}\n`);
  process.exitCode = 1;
}).finally(async () => {
  await closeDb();
});
