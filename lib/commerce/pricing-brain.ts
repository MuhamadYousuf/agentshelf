export const PRICING_PARAMS = {
  /** Price-sensitive buyer acceptance curve slope. */
  sensitiveSlope: 12,
  /** Price-sensitive buyer acceptance curve midpoint as a list-price ratio. */
  sensitiveMidpoint: 0.92,
  /** Tolerant buyer acceptance curve slope. */
  tolerantSlope: 8,
  /** Tolerant buyer acceptance curve midpoint as a list-price ratio. */
  tolerantMidpoint: 1.05,
  /** Bayesian counter behavior slope and zero-gap threshold. */
  counterSlope: 10,
  counterGapThreshold: 0.05,
  /** Belief is kept away from exact zero and one. */
  minimumBelief: 0.02,
  maximumBelief: 0.98,
  /** Merchant offer grids as fractions of list price, inclusive. */
  cooperateRange: [0.97, 1.05] as const,
  recoveryRange: [0.85, 0.9] as const,
  /** Candidate spacing is one percent of list price. */
  gridStep: 0.01,
  /** Prices prefer half-dollar endings when snapped to the candidate grid. */
  preferredIncrementCents: 50,
  maximumRounds: 6,
  lowballFinalRound: 4,
  defaultCostRatio: 0.55,
} as const;

export type PricingState = {
  belief: number;
  state: "cooperate" | "recovery";
  round: number;
  lastOfferCents: number | null;
  /** The prior buyer counter supports the Tit-for-Tat reciprocity rule. */
  lastBuyerOfferCents?: number | null;
};

export type BuyerMove =
  | { type: "open" }
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
  nextState: PricingState;
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

function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

export function acceptanceProbability(priceCents: number, listCents: number, belief: number): number {
  const ratio = priceCents / listCents;
  const sensitive = 1 / (1 + Math.exp(
    PRICING_PARAMS.sensitiveSlope * (ratio - PRICING_PARAMS.sensitiveMidpoint),
  ));
  const tolerant = 1 / (1 + Math.exp(
    PRICING_PARAMS.tolerantSlope * (ratio - PRICING_PARAMS.tolerantMidpoint),
  ));
  return clamp(belief, PRICING_PARAMS.minimumBelief, PRICING_PARAMS.maximumBelief) * sensitive +
    (1 - clamp(belief, PRICING_PARAMS.minimumBelief, PRICING_PARAMS.maximumBelief)) * tolerant;
}

export function updateBuyerBelief(
  belief: number,
  move: BuyerMove,
  listCents: number,
  lastOfferCents: number | null,
): number {
  let likelihoodSensitive: number;
  let likelihoodTolerant: number;

  switch (move.type) {
    case "open":
      return clamp(belief, PRICING_PARAMS.minimumBelief, PRICING_PARAMS.maximumBelief);
    case "counter": {
      const gap = lastOfferCents === null
        ? (listCents - move.priceCents) / listCents
        : (lastOfferCents - move.priceCents) / listCents;
      likelihoodSensitive = sigmoid(PRICING_PARAMS.counterSlope * (gap - PRICING_PARAMS.counterGapThreshold));
      likelihoodTolerant = 1 - likelihoodSensitive;
      break;
    }
    case "accept":
      likelihoodSensitive = 0.3;
      likelihoodTolerant = 0.7;
      break;
    case "walk_away":
      likelihoodSensitive = 0.8;
      likelihoodTolerant = 0.3;
      break;
  }

  const prior = clamp(belief, PRICING_PARAMS.minimumBelief, PRICING_PARAMS.maximumBelief);
  const numerator = prior * likelihoodSensitive;
  const denominator = numerator + (1 - prior) * likelihoodTolerant;
  if (denominator <= 0) return PRICING_PARAMS.minimumBelief;
  return clamp(numerator / denominator, PRICING_PARAMS.minimumBelief, PRICING_PARAMS.maximumBelief);
}

function snapCandidate(price: number, floorCents: number, listCents: number): number {
  const increment = PRICING_PARAMS.preferredIncrementCents;
  const snapped = Math.round(price / increment) * increment;
  const bounded = clamp(snapped, floorCents, listCents);
  if (bounded === floorCents && floorCents % increment !== 0) {
    const nextPreferred = Math.ceil(floorCents / increment) * increment;
    if (nextPreferred <= listCents) return nextPreferred;
  }
  if (bounded === listCents && listCents % increment !== 0) {
    const previousPreferred = Math.floor(listCents / increment) * increment;
    if (previousPreferred >= floorCents) return previousPreferred;
  }
  return bounded;
}

function candidateGrid(
  listCents: number,
  floorCents: number,
  state: "cooperate" | "recovery",
): number[] {
  const [minimumRatio, maximumRatio] = state === "cooperate"
    ? PRICING_PARAMS.cooperateRange
    : PRICING_PARAMS.recoveryRange;
  const prices: number[] = [];
  const step = Math.max(1, Math.round(listCents * PRICING_PARAMS.gridStep));
  const start = Math.round(listCents * minimumRatio);
  const end = Math.round(listCents * maximumRatio);
  for (let raw = start; raw <= end; raw += step) {
    prices.push(snapCandidate(raw, floorCents, listCents));
  }
  prices.push(snapCandidate(end, floorCents, listCents));
  return [...new Set(prices)].sort((left, right) => left - right);
}

export function priceNextMove(input: {
  listCents: number;
  floorCents: number;
  costCents?: number;
  state: PricingState;
  buyerMove: BuyerMove;
}): PricingDecision {
  const { listCents, floorCents, buyerMove } = input;
  const floor = clamp(Math.round(floorCents), 1, Math.round(listCents));
  const list = Math.max(1, Math.round(listCents));
  const cost = input.costCents ?? Math.round(PRICING_PARAMS.defaultCostRatio * list);
  const previousBuyerOffer = input.state.lastBuyerOfferCents ?? null;
  const belief = updateBuyerBelief(input.state.belief, buyerMove, list, input.state.lastOfferCents);

  let state = input.state.state;
  let stateReason: string | undefined;
  if (buyerMove.type === "walk_away") {
    state = "recovery";
    stateReason = "walk_away→recovery";
  } else if (buyerMove.type === "accept") {
    state = "cooperate";
  } else if (
    buyerMove.type === "counter" &&
    previousBuyerOffer !== null &&
    buyerMove.priceCents > previousBuyerOffer
  ) {
    state = "cooperate";
    stateReason = "reciprocal_counter→cooperate";
  }

  const candidates = candidateGrid(list, floor, state).map((priceCents) => ({
    priceCents,
    pAccept: acceptanceProbability(priceCents, list, belief),
    eu: acceptanceProbability(priceCents, list, belief) * (priceCents - cost),
  }));
  const best = candidates.reduce((chosen, candidate) => candidate.eu > chosen.eu ? candidate : chosen);
  const chosen = clamp(
    input.state.lastOfferCents === null ? best.priceCents : Math.min(best.priceCents, input.state.lastOfferCents),
    floor,
    list,
  );
  const nextRound = Math.min(PRICING_PARAMS.maximumRounds, Math.max(0, input.state.round) + 1);
  const nextState: PricingState = {
    belief,
    state,
    round: nextRound,
    lastOfferCents: chosen,
    lastBuyerOfferCents: buyerMove.type === "counter" ? buyerMove.priceCents : previousBuyerOffer,
  };

  let action: PricingDecision["action"] = "offer";
  let priceCents = chosen;
  let reason = stateReason ?? "expected_utility_maximum";

  if (buyerMove.type === "accept") {
    action = "accept";
    priceCents = clamp(input.state.lastOfferCents ?? list, floor, list);
    reason = "buyer_accepts_offer";
  } else if (buyerMove.type === "counter" && buyerMove.priceCents >= chosen) {
    action = "accept";
    priceCents = clamp(buyerMove.priceCents, floor, list);
    state = "cooperate";
    reason = "counter≥offer→accept";
  } else if (
    (buyerMove.type === "counter" && buyerMove.priceCents < floor && nextRound >= PRICING_PARAMS.lowballFinalRound) ||
    nextRound >= PRICING_PARAMS.maximumRounds
  ) {
    action = "final";
    reason = buyerMove.type === "counter" && buyerMove.priceCents < floor
      ? "below_floor→final"
      : "round_cap→final";
  }

  nextState.lastOfferCents = priceCents;
  nextState.state = state;
  return {
    action,
    priceCents,
    nextState,
    trace: {
      belief,
      state,
      candidates,
      chosen,
      reason,
    },
  };
}
