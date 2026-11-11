import { createHash } from "node:crypto";
import { priceNextMove, type BuyerMove, type PricingState } from "@/lib/commerce/pricing-brain";
import type { NegotiationMessage, PricingTraceEntry } from "./schema";

export type DemoHistoryProduct = {
  id: string;
  merchantId: string;
  title: string;
  listPriceCents: number;
  floorPriceCents: number;
  costCents: number | null;
};

export type DemoHistoryNegotiation = {
  id: string;
  productId: string;
  merchantId: string;
  clientName: string;
  messages: NegotiationMessage[];
  status: "agreed";
  state: PricingState["state"];
  belief: number;
  round: number;
  lastOfferCents: number | null;
  lastBuyerOfferCents: number | null;
  breachStreak: number;
  churnStreak: number;
  isDemo: true;
  trace: PricingTraceEntry[];
  createdAt: Date;
  updatedAt: Date;
};

export type DemoHistoryQuote = {
  id: string;
  negotiationId: string | null;
  productId: string;
  merchantId: string;
  passId: null;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
  expiresAt: Date;
  signature: string;
  usedAt: Date;
  createdAt: Date;
};

export type DemoHistoryOrder = {
  id: string;
  quoteId: string;
  merchantId: string;
  productId: string;
  passId: null;
  paypalOrderId: null;
  captureId: null;
  status: "completed" | "refunded";
  amountCents: number;
  qty: number;
  flow: "approval_link" | "agent_pass";
  isDemo: true;
  agentClient: string;
  buyerNote: string | null;
  shipping: null;
  paypalFeeCents: null;
  netCents: null;
  payoutBatchId: null;
  payoutStatus: string | null;
  buyerEmail: null;
  tracking: null;
  createdAt: Date;
  updatedAt: Date;
};

export type DemoHistory = {
  negotiations: DemoHistoryNegotiation[];
  quotes: DemoHistoryQuote[];
  orders: DemoHistoryOrder[];
  buyerMovesByNegotiation: Record<string, BuyerMove[]>;
};

const agentClients = ["Claude Desktop", "AgentShelf Shopper", "ChatGPT", "Cursor"] as const;

function seededRandom(seed: string): () => number {
  let state = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function seededUuid(seed: string, key: string): string {
  const hex = createHash("sha256").update(`${seed}:${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  const variant = Number.parseInt(hex[16] ?? "8", 16);
  hex[16] = ((variant & 0x3) | 0x8).toString(16);
  const raw = hex.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function pick<T>(random: () => number, values: readonly T[]): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new Error("Cannot pick from an empty demo list.");
  return value;
}

function createNegotiatedPrice(input: {
  seed: string;
  random: () => number;
  product: DemoHistoryProduct;
  clientName: string;
  orderIndex: number;
  createdAt: Date;
}): { negotiation: DemoHistoryNegotiation; unitPriceCents: number; buyerMoves: BuyerMove[] } {
  const { seed, random, product, clientName, orderIndex, createdAt } = input;
  const negotiationId = seededUuid(seed, `negotiation:${orderIndex}`);
  let state: PricingState = {
    belief: 0.5,
    state: "cooperate",
    round: 0,
    lastOfferCents: null,
    lastBuyerOfferCents: null,
    breachStreak: 0,
    churnStreak: 0,
  };
  const messages: NegotiationMessage[] = [];
  const trace: PricingTraceEntry[] = [];
  const buyerMoves: BuyerMove[] = [{ type: "open" }];
  const initial = priceNextMove({
    listCents: product.listPriceCents,
    floorCents: product.floorPriceCents,
    ...(product.costCents === null ? {} : { costCents: product.costCents }),
    state,
    buyerMove: buyerMoves[0]!,
  });
  state = initial.nextState;
  trace.push(initial.trace);
  messages.push({ role: "buyer", text: "Could you share a little more about this piece?", at: createdAt.toISOString() });
  messages.push({ role: "merchant", text: `Thanks for asking. I can offer ${formatPrice(initial.priceCents)}.`, offerCents: initial.priceCents, at: createdAt.toISOString() });

  const secondMove = random() < 0.68
    ? { type: "counter" as const, priceCents: Math.round(product.listPriceCents * pick(random, [0.9, 0.94, 0.97] as const)) }
    : { type: "walk_away" as const };
  buyerMoves.push(secondMove);
  messages.push(secondMove.type === "counter"
    ? { role: "buyer", text: `Would you consider ${formatPrice(secondMove.priceCents)}?`, offerCents: secondMove.priceCents, at: createdAt.toISOString() }
    : { role: "buyer", text: "I may need to keep looking at that price.", at: createdAt.toISOString() });
  const second = priceNextMove({
    listCents: product.listPriceCents,
    floorCents: product.floorPriceCents,
    ...(product.costCents === null ? {} : { costCents: product.costCents }),
    state,
    buyerMove: secondMove,
  });
  state = second.nextState;
  trace.push(second.trace);

  let agreedPrice = second.priceCents;
  if (second.action === "accept") {
    agreedPrice = second.priceCents;
    messages.push({ role: "merchant", text: `That works. We are agreed at ${formatPrice(agreedPrice)}.`, offerCents: agreedPrice, at: createdAt.toISOString() });
  } else {
    messages.push({ role: "merchant", text: `${second.action === "final" ? "My final offer" : "I can meet you at"} ${formatPrice(second.priceCents)}.`, offerCents: second.priceCents, at: createdAt.toISOString() });
    const accept: BuyerMove = { type: "accept" };
    buyerMoves.push(accept);
    messages.push({ role: "buyer", text: `Accepted at ${formatPrice(second.priceCents)}.`, offerCents: second.priceCents, at: createdAt.toISOString() });
    const final = priceNextMove({
      listCents: product.listPriceCents,
      floorCents: product.floorPriceCents,
      ...(product.costCents === null ? {} : { costCents: product.costCents }),
      state,
      buyerMove: accept,
    });
    trace.push(final.trace);
    state = final.nextState;
    agreedPrice = final.priceCents;
    messages.push({ role: "merchant", text: `Confirmed. Your total is ${formatPrice(agreedPrice)} per item.`, offerCents: agreedPrice, at: createdAt.toISOString() });
  }

  return {
    unitPriceCents: agreedPrice,
    buyerMoves,
    negotiation: {
      id: negotiationId,
      productId: product.id,
      merchantId: product.merchantId,
      clientName,
      messages,
      status: "agreed",
      state: state.state,
      belief: state.belief,
      round: state.round,
      lastOfferCents: state.lastOfferCents,
      lastBuyerOfferCents: state.lastBuyerOfferCents ?? null,
      breachStreak: state.breachStreak ?? 0,
      churnStreak: 0,
      isDemo: true,
      trace,
      createdAt,
      updatedAt: createdAt,
    },
  };
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function generateDemoHistory(input: {
  seed: string;
  products: DemoHistoryProduct[];
  now: Date;
  orderCount?: number;
}): DemoHistory {
  const random = seededRandom(input.seed);
  const orderCount = input.orderCount ?? 40;
  if (orderCount < 1 || !Number.isInteger(orderCount)) throw new RangeError("Demo history needs a positive whole order count.");
  const productsByMerchant = new Map<string, DemoHistoryProduct[]>();
  for (const product of input.products) {
    const current = productsByMerchant.get(product.merchantId) ?? [];
    current.push(product);
    productsByMerchant.set(product.merchantId, current);
  }
  const merchantIds = [...productsByMerchant.keys()].sort();
  if (merchantIds.length !== 2 || merchantIds.some((id) => (productsByMerchant.get(id)?.length ?? 0) === 0)) {
    throw new Error("Demo history needs published products from exactly two demo shops.");
  }

  const negotiations: DemoHistoryNegotiation[] = [];
  const quotes: DemoHistoryQuote[] = [];
  const orders: DemoHistoryOrder[] = [];
  const buyerMovesByNegotiation: Record<string, BuyerMove[]> = {};
  const recentBiasedDays = Array.from({ length: 14 }, (_, day) => day).flatMap((day) => Array.from({ length: 14 - day }, () => day));
  const refundedIndexes = new Set([7, Math.floor(orderCount * 0.53), Math.floor(orderCount * 0.81)]);
  const agentCount = Math.round(orderCount * 0.6);

  for (let index = 0; index < orderCount; index += 1) {
    const merchantId = merchantIds[index % merchantIds.length]!;
    const shopProducts = productsByMerchant.get(merchantId)!;
    const product = pick(random, shopProducts);
    const daysAgo = pick(random, recentBiasedDays);
    const createdAt = new Date(input.now.getTime() - daysAgo * 86_400_000 - Math.floor(random() * 86_400_000));
    const isAgent = index < agentCount;
    const qty = random() < 0.17 ? 2 : 1;
    const clientName = isAgent ? pick(random, agentClients) : "storefront";
    const flow = isAgent && random() < 0.5 ? "agent_pass" : "approval_link";
    const status = refundedIndexes.has(index) ? "refunded" : "completed";
    let negotiationId: string | null = null;
    let unitPriceCents = product.listPriceCents;

    if (isAgent) {
      const negotiated = createNegotiatedPrice({
        seed: input.seed,
        random,
        product,
        clientName,
        orderIndex: index,
        createdAt,
      });
      negotiationId = negotiated.negotiation.id;
      unitPriceCents = negotiated.unitPriceCents;
      negotiations.push(negotiated.negotiation);
      buyerMovesByNegotiation[negotiated.negotiation.id] = negotiated.buyerMoves;
    }

    const totalCents = unitPriceCents * qty;
    const quoteId = seededUuid(input.seed, `quote:${index}`);
    const expiresAt = new Date(createdAt.getTime() + 15 * 60_000);
    quotes.push({
      id: quoteId,
      negotiationId,
      productId: product.id,
      merchantId,
      passId: null,
      qty,
      unitPriceCents,
      totalCents,
      expiresAt,
      signature: "",
      usedAt: createdAt,
      createdAt,
    });
    const payoutStatus = flow === "agent_pass" ? (random() < 0.76 ? "SUCCESS" : "PENDING") : null;
    orders.push({
      id: seededUuid(input.seed, `order:${index}`),
      quoteId,
      merchantId,
      productId: product.id,
      passId: null,
      paypalOrderId: null,
      captureId: null,
      status,
      amountCents: totalCents,
      qty,
      flow,
      isDemo: true,
      agentClient: clientName,
      buyerNote: status === "refunded" ? "Demo refund" : null,
      shipping: null,
      paypalFeeCents: null,
      netCents: null,
      payoutBatchId: null,
      payoutStatus,
      buyerEmail: null,
      tracking: null,
      createdAt,
      updatedAt: createdAt,
    });
  }
  return { negotiations, quotes, orders, buyerMovesByNegotiation };
}

