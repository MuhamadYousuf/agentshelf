import { describe, expect, it } from "vitest";
import { priceNextMove, type BuyerMove, type PricingState } from "@/lib/commerce/pricing-brain";
import { generateDemoHistory, type DemoHistoryProduct } from "./demo-history";

const products: DemoHistoryProduct[] = Array.from({ length: 9 }, (_, index) => ({
  id: `product-${index}`,
  merchantId: index < 5 ? "maya" : "lahore",
  title: `Handmade item ${index}`,
  listPriceCents: 1800 + index * 350,
  floorPriceCents: 1300 + index * 280,
  costCents: 900 + index * 190,
}));

const now = new Date("2026-11-11T12:00:00.000Z");

describe("demo history", () => {
  it("is deterministic for the same seed, catalog, and time", () => {
    const first = generateDemoHistory({ seed: "fixed-demo", products, now });
    const second = generateDemoHistory({ seed: "fixed-demo", products, now });
    expect(first).toEqual(second);
    expect(first.orders).toHaveLength(40);
    expect(first.orders.filter((order) => order.agentClient !== "storefront")).toHaveLength(24);
    expect(first.orders.every((order) => order.isDemo && order.paypalOrderId === null && order.captureId === null)).toBe(true);
  });

  it("records negotiated prices produced by priceNextMove for each buyer move", () => {
    const history = generateDemoHistory({ seed: "brain-check", products, now });
    const quoteById = new Map(history.quotes.map((quote) => [quote.id, quote]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const negotiationById = new Map(history.negotiations.map((negotiation) => [negotiation.id, negotiation]));
    const agentOrders = history.orders.filter((order) => order.agentClient !== "storefront");

    for (const order of agentOrders) {
      const quote = quoteById.get(order.quoteId);
      const negotiation = quote?.negotiationId ? negotiationById.get(quote.negotiationId) : undefined;
      const product = productById.get(order.productId);
      expect(quote).toBeDefined();
      expect(negotiation).toBeDefined();
      expect(product).toBeDefined();
      if (!quote || !negotiation || !product) throw new Error("Generated agent order is missing its pricing context.");

      let state: PricingState = {
        belief: 0.5,
        state: "cooperate",
        round: 0,
        lastOfferCents: null,
        lastBuyerOfferCents: null,
        breachStreak: 0,
        churnStreak: 0,
      };
      let lastDecision = 0;
      const moves: BuyerMove[] = history.buyerMovesByNegotiation[negotiation.id] ?? [];
      for (const move of moves) {
        const decision = priceNextMove({
          listCents: product.listPriceCents,
          floorCents: product.floorPriceCents,
          ...(product.costCents === null ? {} : { costCents: product.costCents }),
          state,
          buyerMove: move,
        });
        state = decision.nextState;
        lastDecision = decision.priceCents;
      }
      expect(lastDecision).toBe(quote.unitPriceCents);
      expect(order.amountCents).toBe(lastDecision * order.qty);
      expect(negotiation.trace).toHaveLength(moves.length);
    }
  });
});
