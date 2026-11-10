export const MIN_LIST_PRICE_CENTS = 100;
export const MAX_LIST_PRICE_CENTS = 500_000;

export type ClampedPrices = {
  listPriceCents: number;
  floorPriceCents: number;
};

export function clampListingPrices(
  suggestedListPriceCents: unknown,
  suggestedFloorPriceCents: unknown,
): ClampedPrices {
  const rawList = Number(suggestedListPriceCents);
  const listPriceCents = Number.isInteger(rawList)
    ? Math.min(MAX_LIST_PRICE_CENTS, Math.max(MIN_LIST_PRICE_CENTS, rawList))
    : 3_200;

  const minFloor = Math.ceil(listPriceCents / 2);
  const rawFloor = Number(suggestedFloorPriceCents);
  const validFloor =
    Number.isInteger(rawFloor) && rawFloor >= minFloor && rawFloor <= listPriceCents;
  const floorPriceCents = validFloor
    ? rawFloor
    : Math.min(listPriceCents, Math.max(minFloor, Math.round(listPriceCents * 0.8)));

  return { listPriceCents, floorPriceCents };
}
