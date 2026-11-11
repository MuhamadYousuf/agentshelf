import { describe, expect, it } from "vitest";
import { aggregateSalesInsights, type AnalyticsNegotiation, type AnalyticsOrder } from "./analytics";

const from = new Date("2026-11-01T00:00:00.000Z");
const to = new Date("2026-11-04T00:00:00.000Z");

function order(overrides: Partial<AnalyticsOrder> = {}): AnalyticsOrder {
  return {
    id: "order-1",
    createdAt: new Date("2026-11-01T15:00:00.000Z"),
    productId: "product-1",
    productTitle: "Speckled Mug",
    qty: 1,
    amountCents: 2_380,
    listPriceCents: 2_800,
    flow: "approval_link",
    agentClient: "AgentShelf Shopper",
    status: "completed",
    payoutStatus: null,
    negotiationId: "neg-1",
    ...overrides,
  };
}

describe("merchant sales analytics", () => {
  it("splits agent and storefront revenue and groups recognized clients", () => {
    const result = aggregateSalesInsights({
      orders: [
        order(),
        order({
          id: "order-2",
          productId: "product-2",
          productTitle: "Textile pouch",
          amountCents: 4_000,
          listPriceCents: 4_000,
          flow: "approval_link",
          agentClient: "storefront",
          negotiationId: null,
        }),
        order({ id: "order-3", flow: "agent_pass", agentClient: "Claude Desktop", amountCents: 3_000 }),
        order({ id: "order-failed", status: "failed", amountCents: 9_900 }),
      ],
      negotiations: [{ id: "neg-1", createdAt: new Date("2026-11-01T12:00:00.000Z") }],
      from,
      to,
    });

    expect(result.agentRevenueCents).toBe(5_380);
    expect(result.storefrontRevenueCents).toBe(4_000);
    expect(result.agentOrderCount).toBe(2);
    expect(result.storefrontOrderCount).toBe(1);
    expect(result.revenueByAgentClient).toEqual([
      { client: "Claude Desktop", revenueCents: 3_000, orderCount: 1 },
      { client: "AgentShelf Shopper", revenueCents: 2_380, orderCount: 1 },
    ]);
  });

  it("creates UTC day buckets and attributes each order to its UTC day", () => {
    const result = aggregateSalesInsights({
      orders: [
        order({ createdAt: new Date("2026-11-01T23:59:00.000Z") }),
        order({ id: "order-2", createdAt: new Date("2026-11-02T00:01:00.000Z"), agentClient: "storefront" }),
      ],
      negotiations: [],
      from,
      to,
    });
    expect(result.revenueByDay).toEqual([
      { day: "2026-11-01", agentRevenueCents: 2_380, storefrontRevenueCents: 0 },
      { day: "2026-11-02", agentRevenueCents: 0, storefrontRevenueCents: 2_380 },
      { day: "2026-11-03", agentRevenueCents: 0, storefrontRevenueCents: 0 },
    ]);
  });

  it("calculates average agent discount and negotiation conversion", () => {
    const negotiationsInRange: AnalyticsNegotiation[] = [
      { id: "neg-1", createdAt: new Date("2026-11-01T12:00:00.000Z") },
      { id: "neg-2", createdAt: new Date("2026-11-02T12:00:00.000Z") },
      { id: "neg-3", createdAt: new Date("2026-11-03T12:00:00.000Z") },
    ];
    const result = aggregateSalesInsights({
      orders: [
        order(),
        order({ id: "order-2", amountCents: 2_520, negotiationId: "neg-2" }),
        order({ id: "storefront", agentClient: "storefront", negotiationId: null, amountCents: 1_000 }),
      ],
      negotiations: negotiationsInRange,
      from,
      to,
    });
    expect(result.averageNegotiatedDiscountPct).toBeCloseTo(12.5);
    expect(result.negotiationCount).toBe(3);
    expect(result.convertedNegotiationCount).toBe(2);
    expect(result.negotiationConversionPct).toBeCloseTo(200 / 3);
  });
});
