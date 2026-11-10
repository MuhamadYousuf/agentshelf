/**
 * Marketplace adaptations to Algorithms 2–3: candidate prices clamp to [floor, list],
 * offers never rise within a negotiation, and a buyer counter at or above our next
 * selected offer is accepted at the buyer's price. Anonymous buyers start at 0.5.
 */
export const PRICING_PARAMS = {
  /** Price-sensitive buyer acceptance curve: 1 / (1 + exp(12 × (r - 0.92))). */
  sensitiveSlope: 12,
  sensitiveMidpoint: 0.92,
  /** Tolerant buyer acceptance curve: 1 / (1 + exp(8 × (r - 1.05))). */
  tolerantSlope: 8,
  tolerantMidpoint: 1.05,
  /** Posterior belief remains away from exact zero and one. */
  minimumBelief: 0.02,
  maximumBelief: 0.98,
  /** Algorithm 2 candidate multipliers, in order of lower then higher price. */
  cooperateCandidates: [0.97, 1.05] as const,
  recoveryCandidates: [0.85, 0.9] as const,
  /** Estimated unit cost when the merchant has not supplied a private cost. */
  defaultCostRatio: 0.55,
  maximumRounds: 6,
  /** A counter below this ratio of our offer is an Algorithm 3 breach. */
  breachTolerance: 1.05,
  /** Algorithm 3's second consecutive tolerance breach triggers the final offer. */
  finalBreachStreak: 2,
} as const;

export type PricingState = {
  belief: number;
  state: "cooperate" | "recovery";
  round: number;
  lastOfferCents: number | null;
  lastBuyerOfferCents?: number | null;
  breachStreak?: number;
  churnStreak?: number;
};

export type BuyerMove =
  | { type: "open" }
  | { type: "question" }
  | { type: "counter"; priceCents: number }
  | { type: "accept" }
  | { type: "walk_away" };

export type PricingCandidate = {
  priceCents: number;
  pAccept: number;
  eu: number;
};

export type PricingDecision = {
  action: "offer" | "accept" | "final";
  priceCents: number;
  nextState: PricingState & { breachStreak: number; churnStreak: number };
  trace: {
    belief: number;
    state: "cooperate" | "recovery";
    candidates: PricingCandidate[];
    chosen: number;
    reason: string;
  };
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function logisticAcceptance(priceCents: number, listCents: number, slope: number, midpoint: number): number {
  return 1 / (1 + Math.exp(slope * (priceCents / listCents - midpoint)));
}

export function acceptanceProbability(priceCents: number, listCents: number, belief: number): number {
  const boundedBelief = clamp(belief, PRICING_PARAMS.minimumBelief, PRICING_PARAMS.maximumBelief);
  const sensitive = logisticAcceptance(
    priceCents,
    listCents,
    PRICING_PARAMS.sensitiveSlope,
    PRICING_PARAMS.sensitiveMidpoint,
  );
  const tolerant = logisticAcceptance(
    priceCents,
    listCents,
    PRICING_PARAMS.tolerantSlope,
    PRICING_PARAMS.tolerantMidpoint,
  );
  return boundedBelief * sensitive + (1 - boundedBelief) * tolerant;
}

/** Prior from an optional, trusted buyer segment. Unknown buyers use 0.5. */
export function priorFromSegment(segment?: string | null): number {
  if (!segment) return 0.5;
  const normalized = segment.trim().toLowerCase();
  if (normalized === "price_sensitive" || normalized === "price-sensitive") return 0.75;
  if (normalized === "tolerant") return 0.25;
  return 0.5;
}

/** Algorithm 2 Bayesian update using the likelihood of purchase at the last shown price. */
export function updateBuyerBelief(
  belief: number,
  move: BuyerMove,
  listCents: number,
  lastOfferCents: number | null,
): number {
  if (move.type === "open") {
    return clamp(belief, PRICING_PARAMS.minimumBelief, PRICING_PARAMS.maximumBelief);
  }

  const observedPrice = lastOfferCents ?? listCents;
  const purchaseLikelihoodSensitive = logisticAcceptance(
    observedPrice,
    listCents,
    PRICING_PARAMS.sensitiveSlope,
    PRICING_PARAMS.sensitiveMidpoint,
  );
  const purchaseLikelihoodTolerant = logisticAcceptance(
    observedPrice,
    listCents,
    PRICING_PARAMS.tolerantSlope,
    PRICING_PARAMS.tolerantMidpoint,
  );
  const accepted = move.type === "accept" ||
    (move.type === "counter" && lastOfferCents !== null && move.priceCents >= lastOfferCents);
  const likelihoodSensitive = accepted ? purchaseLikelihoodSensitive : 1 - purchaseLikelihoodSensitive;
  const likelihoodTolerant = accepted ? purchaseLikelihoodTolerant : 1 - purchaseLikelihoodTolerant;
  const prior = clamp(belief, PRICING_PARAMS.minimumBelief, PRICING_PARAMS.maximumBelief);
  const sensitiveWeight = prior * likelihoodSensitive;
  const tolerantWeight = (1 - prior) * likelihoodTolerant;
  const denominator = sensitiveWeight + tolerantWeight;
  if (denominator <= 0) return PRICING_PARAMS.minimumBelief;
  return clamp(sensitiveWeight / denominator, PRICING_PARAMS.minimumBelief, PRICING_PARAMS.maximumBelief);
}

function candidatePrices(
  listCents: number,
  floorCents: number,
  state: "cooperate" | "recovery",
): number[] {
  const multipliers = state === "cooperate"
    ? PRICING_PARAMS.cooperateCandidates
    : PRICING_PARAMS.recoveryCandidates;
  const bounded = multipliers.map((multiplier) => Math.round(clamp(
    Math.round(listCents * multiplier),
    floorCents,
    listCents,
  )));
  return [...new Set(bounded)];
}

export function priceNextMove(input: {
  listCents: number;
  floorCents: number;
  costCents?: number;
  state: PricingState;
  buyerMove: BuyerMove;
}): PricingDecision {
  const list = Math.max(1, Math.round(input.listCents));
  const floor = clamp(Math.round(input.floorCents), 1, list);
  const cost = input.costCents === undefined
    ? Math.round(PRICING_PARAMS.defaultCostRatio * list)
    : clamp(Math.round(input.costCents), 0, list);
  const priorOffer = input.state.lastOfferCents === null
    ? null
    : clamp(Math.round(input.state.lastOfferCents), floor, list);
  const priorBuyerOffer = input.state.lastBuyerOfferCents ?? null;
  let belief = updateBuyerBelief(input.state.belief, input.buyerMove, list, priorOffer);

  const breach = input.buyerMove.type === "walk_away" || (
    input.buyerMove.type === "counter" &&
    priorOffer !== null &&
    input.buyerMove.priceCents < priorOffer &&
    priorOffer > input.buyerMove.priceCents * PRICING_PARAMS.breachTolerance
  );
  let breachStreak = input.buyerMove.type === "open"
    ? (input.state.breachStreak ?? 0)
    : breach
      ? (input.state.breachStreak ?? 0) + 1
      : 0;

  let state: PricingState["state"] = breachStreak > 0 ? "recovery" : "cooperate";
  let reason = breach
    ? "breach→DEFECT_RECOVERY (Alg.3 l.21)"
    : state === "recovery"
      ? "recovery_persists (Alg.3)"
      : "no_breach→cooperate (Alg.3)";

  if (input.buyerMove.type === "accept") {
    state = "cooperate";
    breachStreak = 0;
    reason = "buyer_accept→cooperate (Alg.3)";
  }

  let candidates = candidatePrices(list, floor, state).map((priceCents) => {
    const pAccept = acceptanceProbability(priceCents, list, belief);
    return { priceCents, pAccept, eu: pAccept * (priceCents - cost) };
  });
  const selectCandidate = (options: PricingCandidate[]) => options.reduce((best, candidate) => candidate.eu > best.eu ? candidate : best);
  let best = selectCandidate(candidates);
  let chosen = priorOffer === null ? best.priceCents : Math.min(best.priceCents, priorOffer);
  const nextRound = Math.min(PRICING_PARAMS.maximumRounds, Math.max(0, input.state.round) + 1);
  let action: PricingDecision["action"] = "offer";
  let priceCents = chosen;
  const acceptedCounter = input.buyerMove.type === "counter" && input.buyerMove.priceCents >= chosen;
  if (acceptedCounter && priorOffer !== null && input.buyerMove.type === "counter" && input.buyerMove.priceCents < priorOffer) {
    belief = updateBuyerBelief(input.state.belief, { type: "accept" }, list, priorOffer);
    candidates = candidatePrices(list, floor, state).map((priceCents) => {
      const pAccept = acceptanceProbability(priceCents, list, belief);
      return { priceCents, pAccept, eu: pAccept * (priceCents - cost) };
    });
    best = selectCandidate(candidates);
    chosen = Math.min(best.priceCents, priorOffer);
    priceCents = chosen;
  }
  if (input.buyerMove.type === "accept") {
    action = "accept";
    priceCents = priorOffer ?? chosen;
    reason = "buyer_accepts_offer";
  } else if (input.buyerMove.type === "counter" && acceptedCounter) {
    action = "accept";
    priceCents = clamp(input.buyerMove.priceCents, floor, list);
    state = "cooperate";
    reason = "counter≥offer→accept";
  } else if (breachStreak >= PRICING_PARAMS.finalBreachStreak) {
    action = "final";
    reason = "breach_streak≥2→FINAL_OFFER (Alg.3)";
  } else if (nextRound >= PRICING_PARAMS.maximumRounds) {
    action = "final";
    reason = "round_cap→FINAL_OFFER (Alg.3)";
  }

  if (input.buyerMove.type === "accept" || acceptedCounter) {
    state = "cooperate";
    breachStreak = 0;
  }
  const nextState = {
    belief,
    state,
    round: nextRound,
    lastOfferCents: priceCents,
    lastBuyerOfferCents: input.buyerMove.type === "counter" ? input.buyerMove.priceCents : priorBuyerOffer,
    breachStreak,
    // Retained as a zeroed compatibility field for the P03 database column; Algorithm 3 uses breachStreak.
    churnStreak: 0,
  };

  return {
    action,
    priceCents: clamp(priceCents, floor, list),
    nextState,
    trace: { belief, state, candidates, chosen, reason },
  };
}
