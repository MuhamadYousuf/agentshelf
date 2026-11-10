import { describe, expect, it } from "vitest";
import { priceNextMove, type PricingState } from "./pricing-brain";

const start: PricingState = {
  belief: 0.5,
  state: "cooperate",
  round: 0,
  lastOfferCents: null,
  lastBuyerOfferCents: null,
};

describe("pricing brain", () => {
  it("keeps prices in bounds and merchant offers non-increasing over 1,000 deterministic random inputs", () => {
    let seed = 0x1234abcd;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };

    for (let index = 0; index < 1_000; index += 1) {
      const listCents = 100 + Math.floor(random() * 500_000);
      const floorCents = 1 + Math.floor(random() * listCents);
      const previousOffer = floorCents + Math.floor(random() * (listCents - floorCents + 1));
      const state: PricingState = {
        belief: random(),
        state: random() > 0.5 ? "cooperate" : "recovery",
        round: Math.floor(random() * 6),
        lastOfferCents: previousOffer,
        lastBuyerOfferCents: floorCents + Math.floor(random() * (listCents - floorCents + 1)),
      };
      const move = index % 3 === 0
        ? { type: "open" as const }
        : index % 3 === 1
          ? { type: "counter" as const, priceCents: Math.floor(random() * (listCents + 1)) }
          : { type: "walk_away" as const };
      const result = priceNextMove({ listCents, floorCents, state, buyerMove: move });

      expect(result.priceCents).toBeGreaterThanOrEqual(floorCents);
      expect(result.priceCents).toBeLessThanOrEqual(listCents);
      if (result.action === "offer" || result.action === "final") {
        expect(result.priceCents).toBeLessThanOrEqual(previousOffer);
      }
      expect(result.trace).not.toHaveProperty("floorCents");
      expect(result.trace).not.toHaveProperty("costCents");
    }
  });

  it("lowers an offer after a walk-away by entering recovery", () => {
    const opening = priceNextMove({
      listCents: 10_000,
      floorCents: 6_000,
      state: start,
      buyerMove: { type: "open" },
    });
    const recovery = priceNextMove({
      listCents: 10_000,
      floorCents: 6_000,
      state: { ...opening.nextState, round: 1 },
      buyerMove: { type: "walk_away" },
    });
    expect(recovery.nextState.state).toBe("recovery");
    expect(recovery.priceCents).toBeLessThan(opening.priceCents);
  });

  it("raises price sensitivity belief after a large lowball", () => {
    const result = priceNextMove({
      listCents: 10_000,
      floorCents: 6_000,
      state: { ...start, lastOfferCents: 9_800 },
      buyerMove: { type: "counter", priceCents: 3_000 },
    });
    expect(result.nextState.belief).toBeGreaterThan(start.belief);
  });

  it("accepts a counter at or above its chosen offer", () => {
    const opening = priceNextMove({
      listCents: 10_000,
      floorCents: 6_000,
      state: start,
      buyerMove: { type: "open" },
    });
    const result = priceNextMove({
      listCents: 10_000,
      floorCents: 6_000,
      state: start,
      buyerMove: { type: "counter", priceCents: opening.trace.chosen + 100 },
    });
    expect(result.action).toBe("accept");
    expect(result.priceCents).toBe(opening.trace.chosen + 100);
  });

  it("returns to cooperation after an agreement", () => {
    const result = priceNextMove({
      listCents: 10_000,
      floorCents: 6_000,
      state: { ...start, state: "recovery", lastOfferCents: 8_800 },
      buyerMove: { type: "counter", priceCents: 9_000 },
    });
    expect(result.action).toBe("accept");
    expect(result.nextState.state).toBe("cooperate");
    expect(result.trace.state).toBe("cooperate");
  });

  it("is deterministic and caps an open round at six", () => {
    const input = {
      listCents: 8_100,
      floorCents: 5_000,
      state: { ...start, round: 5, lastOfferCents: 7_900 },
      buyerMove: { type: "open" as const },
    };
    expect(priceNextMove(input)).toEqual(priceNextMove(input));
    expect(priceNextMove(input).action).toBe("final");
  });
});
