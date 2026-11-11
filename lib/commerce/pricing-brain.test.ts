import { describe, expect, it } from "vitest";
import {
  acceptanceProbability,
  priceNextMove,
  priorFromSegment,
  PRICING_PARAMS,
  updateBuyerBelief,
  type PricingState,
} from "./pricing-brain";

const start: PricingState = {
  belief: 0.5,
  state: "cooperate",
  round: 0,
  lastOfferCents: null,
  lastBuyerOfferCents: null,
  breachStreak: 0,
  churnStreak: 0,
};

describe("paper pricing model", () => {
  it("uses the two Algorithm 2 logistic acceptance curves and mixture", () => {
    const price = 9_200;
    const list = 10_000;
    const sensitive = 1 / (1 + Math.exp(12 * (0.92 - 0.92)));
    const tolerant = 1 / (1 + Math.exp(8 * (0.92 - 1.05)));
    expect(acceptanceProbability(price, list, 0.75)).toBeCloseTo(0.75 * sensitive + 0.25 * tolerant, 12);
  });

  it("updates belief from non-purchase likelihoods at the shown offer", () => {
    const offer = 9_700;
    const list = 10_000;
    const pSensitive = 1 / (1 + Math.exp(12 * (0.97 - 0.92)));
    const pTolerant = 1 / (1 + Math.exp(8 * (0.97 - 1.05)));
    const expected = (0.5 * (1 - pSensitive)) /
      (0.5 * (1 - pSensitive) + 0.5 * (1 - pTolerant));
    expect(updateBuyerBelief(0.5, { type: "counter", priceCents: 4_000 }, list, offer)).toBeCloseTo(expected, 12);
    expect(updateBuyerBelief(0.5, { type: "accept" }, list, offer)).toBeCloseTo(
      (0.5 * pSensitive) / (0.5 * pSensitive + 0.5 * pTolerant),
      12,
    );
    expect(updateBuyerBelief(0.5, { type: "open" }, list, offer)).toBe(0.5);
  });

  it("uses Algorithm 2's exact cooperate and recovery candidate multipliers", () => {
    const opening = priceNextMove({
      listCents: 10_000,
      floorCents: 5_000,
      state: start,
      buyerMove: { type: "open" },
    });
    expect(opening.trace.candidates.map(({ priceCents }) => priceCents)).toEqual([9_700, 10_000]);

    const recovery = priceNextMove({
      listCents: 10_000,
      floorCents: 5_000,
      state: { ...start, state: "recovery", breachStreak: 1 },
      buyerMove: { type: "open" },
    });
    expect(recovery.trace.candidates.map(({ priceCents }) => priceCents)).toEqual([8_500, 9_000]);
    expect(PRICING_PARAMS.defaultCostRatio).toBe(0.55);
  });

  it("enters recovery on an Algorithm 3 breach and makes the second breach offer final", () => {
    const opening = priceNextMove({
      listCents: 2_800,
      floorCents: 1_900,
      state: start,
      buyerMove: { type: "open" },
    });
    expect(opening.priceCents).toBe(2_716);
    const breach = priceNextMove({
      listCents: 2_800,
      floorCents: 1_900,
      state: opening.nextState,
      buyerMove: { type: "counter", priceCents: 1_800 },
    });
    expect(breach.nextState.breachStreak).toBe(1);
    expect(breach.nextState.state).toBe("recovery");
    expect(breach.trace.reason).toBe("breach→DEFECT_RECOVERY (Alg.3 l.21)");
    expect(breach.priceCents).toBeLessThan(opening.priceCents);

    const secondBreach = priceNextMove({
      listCents: 2_800,
      floorCents: 1_900,
      state: breach.nextState,
      buyerMove: { type: "counter", priceCents: 1_500 },
    });
    expect(secondBreach.action).toBe("final");
    expect(secondBreach.nextState.breachStreak).toBe(2);
    expect(secondBreach.trace.reason).toContain("breach_streak≥2→FINAL_OFFER");
  });

  it("matches the documented $28 mug sequence through the $23.80 floor offer", () => {
    const opening = priceNextMove({
      listCents: 2_800,
      floorCents: 2_380,
      costCents: 1_540,
      state: start,
      buyerMove: { type: "open" },
    });
    const response = priceNextMove({
      listCents: 2_800,
      floorCents: 2_380,
      costCents: 1_540,
      state: opening.nextState,
      buyerMove: { type: "counter", priceCents: 2_200 },
    });

    expect(opening.priceCents).toBe(2_716);
    expect(response.priceCents).toBe(2_380);
    expect(response.action).toBe("offer");
    expect(response.nextState.state).toBe("recovery");
    expect(response.nextState.breachStreak).toBe(1);
  });

  it("counts an explicit walk-away as breach and lowers the next offer", () => {
    const opening = priceNextMove({
      listCents: 10_000,
      floorCents: 6_000,
      state: start,
      buyerMove: { type: "open" },
    });
    const recovery = priceNextMove({
      listCents: 10_000,
      floorCents: 6_000,
      state: opening.nextState,
      buyerMove: { type: "walk_away" },
    });
    expect(recovery.nextState.breachStreak).toBe(1);
    expect(recovery.nextState.state).toBe("recovery");
    expect(recovery.priceCents).toBeLessThan(opening.priceCents);
  });

  it("resets a non-breach streak and returns to cooperation after agreement", () => {
    const result = priceNextMove({
      listCents: 10_000,
      floorCents: 6_000,
      state: {
        ...start,
        state: "recovery",
        round: 1,
        lastOfferCents: 9_000,
        breachStreak: 1,
        churnStreak: 1,
      },
      buyerMove: { type: "counter", priceCents: 8_700 },
    });
    expect(result.nextState.breachStreak).toBe(0);
    expect(result.nextState.state).toBe("cooperate");
  });

  it("accepts a counter at or above the chosen offer at the buyer's price", () => {
    const result = priceNextMove({
      listCents: 10_000,
      floorCents: 6_000,
      state: { ...start, lastOfferCents: 9_000 },
      buyerMove: { type: "counter", priceCents: 9_100 },
    });
    expect(result.action).toBe("accept");
    expect(result.priceCents).toBe(9_100);
    expect(result.nextState.state).toBe("cooperate");
  });

  it("uses purchase likelihoods when a counter clears the newly selected offer", () => {
    const offer = 9_800;
    const list = 10_000;
    const counter = 9_750;
    const pSensitive = 1 / (1 + Math.exp(12 * (offer / list - 0.92)));
    const pTolerant = 1 / (1 + Math.exp(8 * (offer / list - 1.05)));
    const acceptedBelief = (0.5 * pSensitive) / (0.5 * pSensitive + 0.5 * pTolerant);
    const result = priceNextMove({
      listCents: list,
      floorCents: 6_000,
      state: { ...start, lastOfferCents: offer },
      buyerMove: { type: "counter", priceCents: counter },
    });
    expect(result.action).toBe("accept");
    expect(result.priceCents).toBe(counter);
    expect(result.nextState.belief).toBeCloseTo(acceptedBelief, 12);
  });

  it("uses 0.5 for anonymous buyers and typed segment priors", () => {
    expect(priorFromSegment()).toBe(0.5);
    expect(priorFromSegment("price_sensitive")).toBe(0.75);
    expect(priorFromSegment("tolerant")).toBe(0.25);
  });

  it("keeps every price within bounds and every merchant offer non-increasing over 1,000 inputs", () => {
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
        breachStreak: Math.floor(random() * 3),
        churnStreak: Math.floor(random() * 3),
      };
      const move = index % 4 === 0
        ? { type: "open" as const }
        : index % 4 === 1
          ? { type: "counter" as const, priceCents: Math.floor(random() * (listCents + 1)) }
          : index % 4 === 2
            ? { type: "walk_away" as const }
            : { type: "accept" as const };
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

  it("is deterministic and caps an open negotiation at six rounds", () => {
    const input = {
      listCents: 8_100,
      floorCents: 5_000,
      state: { ...start, round: 5, lastOfferCents: 7_900 },
      buyerMove: { type: "open" as const },
    };
    expect(priceNextMove(input)).toEqual(priceNextMove(input));
    expect(priceNextMove(input).action).toBe("final");
    expect(priceNextMove(input).nextState.round).toBe(6);
  });

  it.each([
    {
      label: "second tolerance breach",
      state: { ...start, round: 2, lastOfferCents: 9_000, breachStreak: 1 },
      buyerMove: { type: "counter" as const, priceCents: 7_000 },
    },
    {
      label: "second walk-away",
      state: { ...start, round: 2, lastOfferCents: 9_000, breachStreak: 1 },
      buyerMove: { type: "walk_away" as const },
    },
    {
      label: "an already reached breach threshold",
      state: { ...start, round: 2, lastOfferCents: 9_000, breachStreak: 2 },
      buyerMove: { type: "open" as const },
    },
  ])("returns a final action for $label", ({ state, buyerMove }) => {
    const result = priceNextMove({ listCents: 10_000, floorCents: 6_000, state, buyerMove });
    expect(result.nextState.breachStreak).toBeGreaterThanOrEqual(2);
    expect(result.action).toBe("final");
  });

  it("preserves price and state invariants across 2,500 seeded buyer-move sequences", () => {
    let seed = 0x6d2b79f5;
    const random = () => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 0x1_0000_0000;
    };

    const sequenceCount = 2_500;
    for (let sequence = 0; sequence < sequenceCount; sequence += 1) {
      const listCents = 100 + Math.floor(random() * 500_000);
      const floorCents = 1 + Math.floor(random() * listCents);
      let state: PricingState = {
        belief: random(),
        state: random() < 0.5 ? "cooperate" : "recovery",
        round: 0,
        lastOfferCents: null,
        lastBuyerOfferCents: null,
        breachStreak: 0,
        churnStreak: 0,
      };

      for (let turn = 0; turn < 10; turn += 1) {
        const moveKind = Math.floor(random() * 5);
        const buyerMove = moveKind === 0
          ? { type: "open" as const }
          : moveKind === 1
            ? { type: "question" as const }
            : moveKind === 2
              ? { type: "walk_away" as const }
              : moveKind === 3
                ? { type: "accept" as const }
                : { type: "counter" as const, priceCents: Math.floor(random() * (listCents * 1.2 + 1)) };
        const input = { listCents, floorCents, state, buyerMove };
        const decision = priceNextMove(input);

        expect(decision.priceCents).toBeGreaterThanOrEqual(floorCents);
        expect(decision.priceCents).toBeLessThanOrEqual(listCents);
        expect(decision.nextState.belief).toBeGreaterThanOrEqual(0);
        expect(decision.nextState.belief).toBeLessThanOrEqual(1);
        expect(priceNextMove(input)).toEqual(decision);

        if (state.lastOfferCents !== null && (decision.action === "offer" || decision.action === "final")) {
          expect(decision.priceCents).toBeLessThanOrEqual(state.lastOfferCents);
        }
        if (decision.nextState.breachStreak >= PRICING_PARAMS.finalBreachStreak) {
          expect(decision.action).toBe("final");
        }

        if (decision.action === "accept" || decision.action === "final") break;
        state = decision.nextState;
      }
    }
  });
});
