import {
  priceNextMove,
  type BuyerMove,
  type PricingDecision,
  type PricingState,
} from "./pricing-brain";

export type MerchantPricingSettings = {
  autoAccept: boolean;
  maxDiscountPct: number;
};

export type ProductPricingSettings = {
  listPriceCents: number;
  floorPriceCents: number;
  costCents: number | null;
  maxDiscountPct: number | null;
  stock: number;
  reserved: number;
};

export function effectiveFloorCents(
  product: Pick<ProductPricingSettings, "listPriceCents" | "floorPriceCents" | "maxDiscountPct">,
  merchant: Pick<MerchantPricingSettings, "maxDiscountPct">,
): number {
  const maximumDiscount = product.maxDiscountPct ?? merchant.maxDiscountPct;
  const discountFloor = Math.ceil(product.listPriceCents * (1 - maximumDiscount / 100));
  return Math.max(product.floorPriceCents, discountFloor);
}

export function availableStock(product: Pick<ProductPricingSettings, "stock" | "reserved">): number {
  return Math.max(0, product.stock - product.reserved);
}

export function validateQuantity(quantity: number, availability = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new Error("Choose a quantity from 1 to 10.");
  }
  if (quantity > availability) throw new Error("There is not enough stock available for that quantity.");
}

export function priceWithMerchantPolicy(input: {
  product: ProductPricingSettings;
  merchant: MerchantPricingSettings;
  state: PricingState;
  buyerMove: BuyerMove;
}): PricingDecision {
  const floorCents = effectiveFloorCents(input.product, input.merchant);
  const decision = priceNextMove({
    listCents: input.product.listPriceCents,
    floorCents,
    costCents: input.product.costCents ?? undefined,
    state: input.state,
    buyerMove: input.buyerMove,
  });
  if (!input.merchant.autoAccept && input.buyerMove.type === "counter" && decision.action === "accept") {
    return {
      ...decision,
      action: decision.nextState.round >= 6 ? "final" : "offer",
      priceCents: decision.trace.chosen,
      nextState: { ...decision.nextState, lastOfferCents: decision.trace.chosen },
      trace: { ...decision.trace, reason: "auto_accept_disabled" },
    };
  }
  return decision;
}
