export type NegotiationGridSource = {
  id: string;
  productTitle: string;
  clientName: string;
  updatedAt: Date | string;
  round: number;
  status: string;
  state: "cooperate" | "recovery";
  listPriceCents: number;
  lastOfferCents: number | null;
  messages: Array<{ role: string; offerCents?: number }>;
};

export type NegotiationGridRow = {
  id: string;
  time: string;
  product: string;
  agentClient: string;
  rounds: number;
  openingOfferCents: number | null;
  finalPriceCents: number | null;
  discountPct: number | null;
  outcome: "deal" | "walked" | "open";
  strategyState: "COOPERATE" | "DEFECT_RECOVERY";
};

export function mapNegotiationForGrid(source: NegotiationGridSource): NegotiationGridRow {
  const openingOfferCents = source.messages.find((message) => message.role === "merchant" && message.offerCents !== undefined)?.offerCents ?? null;
  const finalPriceCents = source.lastOfferCents;
  return {
    id: source.id,
    time: source.updatedAt instanceof Date ? source.updatedAt.toISOString() : source.updatedAt,
    product: source.productTitle,
    agentClient: source.clientName,
    rounds: source.round,
    openingOfferCents,
    finalPriceCents,
    discountPct: finalPriceCents === null || source.listPriceCents <= 0
      ? null
      : Math.max(0, ((source.listPriceCents - finalPriceCents) / source.listPriceCents) * 100),
    outcome: source.status === "agreed" ? "deal" : source.status === "declined" ? "walked" : "open",
    strategyState: source.state === "recovery" ? "DEFECT_RECOVERY" : "COOPERATE",
  };
}

export function mapNegotiationsForGrid(sources: NegotiationGridSource[]): NegotiationGridRow[] {
  return sources.map(mapNegotiationForGrid);
}
