import { describe, expect, it, vi } from "vitest";
import { createCopilotTools, type CopilotToolDependencies } from "./copilot";
import type { SalesInsights } from "@/lib/merchant/analytics";
import type { OwnedOrderForAction } from "@/lib/merchant/order-operations";

function insights(): SalesInsights {
  return {
    from: "2026-11-04T00:00:00.000Z",
    to: "2026-11-11T00:00:00.000Z",
    totalRevenueCents: 2_380,
    agentRevenueCents: 2_380,
    storefrontRevenueCents: 0,
    agentOrderCount: 1,
    storefrontOrderCount: 0,
    agentSharePct: 100,
    averageNegotiatedDiscountPct: 15,
    negotiationConversionPct: 25,
    negotiationCount: 4,
    convertedNegotiationCount: 1,
    revenueByDay: [],
    revenueByAgentClient: [],
    topProducts: [{ productId: "product-1", title: "Speckled Mug", revenueCents: 2_380, orderCount: 1 }],
  };
}

function ownedOrder(overrides: Partial<OwnedOrderForAction> = {}): OwnedOrderForAction {
  return {
    id: "order-1",
    merchantId: "merchant-1",
    flow: "agent_pass",
    status: "completed",
    captureId: "capture-1",
    paypalOrderId: "paypal-1",
    amountCents: 2_380,
    productTitle: "Speckled Mug",
    agentClient: "AgentShelf Shopper",
    payoutStatus: "SUCCESS",
    tracking: null,
    ...overrides,
  };
}

function dependencies(row: OwnedOrderForAction | undefined = ownedOrder()): CopilotToolDependencies {
  return {
    getSalesInsights: vi.fn(async () => insights()),
    findOrders: vi.fn(async () => []),
    loadOrder: vi.fn(async (merchantId: string, orderId: string) => row?.id === orderId && row.merchantId === merchantId ? row : undefined),
    addTracking: vi.fn(async () => ({ message: "Tracking saved.", paypalSynced: true })),
    getPayPalOrder: vi.fn(async () => ({ status: "COMPLETED", amountCents: 2_380, payerCountry: "US" })),
  };
}

describe("merchant Copilot tools", () => {
  it("uses merchant-scoped database insights", async () => {
    const deps = dependencies();
    const tools = createCopilotTools("merchant-1", deps);
    const result = await tools.sales_insights.execute({ range: "7d" }, {
      toolCallId: "tool-1",
      messages: [],
      abortSignal: new AbortController().signal,
      context: {},
    });
    expect(deps.getSalesInsights).toHaveBeenCalledWith("merchant-1", "7d");
    expect(result).toMatchObject({ agentRevenueCents: 2_380, storefrontRevenueCents: 0, timezone: "UTC" });
  });

  it("returns friendly tool results when sales or order reads fail", async () => {
    const deps = {
      ...dependencies(),
      getSalesInsights: vi.fn(async () => { throw new Error("database detail must not escape"); }),
      findOrders: vi.fn(async () => { throw new Error("database detail must not escape"); }),
    };
    const tools = createCopilotTools("merchant-1", deps);
    const context = { toolCallId: "tool-error", messages: [], abortSignal: new AbortController().signal, context: {} };
    const sales = await tools.sales_insights.execute({ range: "7d" }, context);
    const orders = await tools.find_orders.execute({ limit: 5 }, context);
    expect(sales).toEqual({ error: "Sales insights are unavailable right now. Try again shortly." });
    expect(orders).toEqual({ error: "Orders are unavailable right now. Try again shortly." });
    expect(JSON.stringify([sales, orders])).not.toContain("database detail");
  });

  it("refund_order returns needs_confirmation and never executes create_refund", async () => {
    const deps = dependencies();
    const effects = [] as Parameters<typeof createCopilotTools>[2];
    const tools = createCopilotTools("merchant-1", deps, effects);
    const result = await tools.refund_order.execute({ order_id: "order-1", reason: "buyer request" }, {
      toolCallId: "tool-2",
      messages: [],
      abortSignal: new AbortController().signal,
      context: {},
    });
    expect(result).toMatchObject({ status: "needs_confirmation", order_id: "order-1", amount_cents: 2_380 });
    expect(effects).toHaveLength(1);
    expect(deps.addTracking).not.toHaveBeenCalled();
  });

  it("returns a friendly error for another merchant's order", async () => {
    const deps = dependencies(undefined);
    const tools = createCopilotTools("merchant-2", deps);
    const result = await tools.refund_order.execute({ order_id: "order-1", reason: "buyer request" }, {
      toolCallId: "tool-3",
      messages: [],
      abortSignal: new AbortController().signal,
      context: {},
    });
    expect(result).toMatchObject({ status: "not_refundable" });
    expect(JSON.stringify(result)).toContain("could not be found");
  });
});
