import { describe, expect, it } from "vitest";
import type { ShopperEvent } from "@/lib/agents/shopper-events";
import { buildPriceNodes } from "./shopper-experience";

describe("buildPriceNodes", () => {
  it("shows the settled price once when both sides confirm the same amount", () => {
    const events: ShopperEvent[] = [
      {
        type: "picked",
        product: {
          product_id: "11111111-1111-4111-8111-111111111111",
          title: "Handmade mug",
          shop: "Maya's Clay Studio",
          price_cents: 2_800,
          category: "ceramics",
          description: "A handmade ceramic mug.",
          image_url: null,
          product_url: "https://agentshelf.test/s/maya-clay/p/11111111-1111-4111-8111-111111111111",
        },
        reason: "Fits the request.",
      },
      { type: "shop_message", text: "Agreed.", action: "accept", offer_cents: 2_380, round: 2 },
      { type: "buyer_message", text: "That works.", move: "accept", price_cents: 2_380 },
      {
        type: "summary",
        item: "Handmade mug",
        shop: "Maya's Clay Studio",
        list_price_cents: 2_800,
        paid_price_cents: 2_380,
        saved_cents: 420,
        saved_percent: 15,
        rounds: 2,
        flow: "approval_link",
      },
    ];

    const nodes = buildPriceNodes(events);
    expect(nodes.filter((node) => node.cents === 2_380)).toEqual([
      { key: "shop-1", label: "Agreed", cents: 2_380, kind: "agreed" },
    ]);
  });

  it("does not repeat the agreed price when the shop confirms after the buyer accepts", () => {
    const picked = {
      type: "picked",
      product: {
        product_id: "11111111-1111-4111-8111-111111111111",
        title: "Handmade mug",
        shop: "Maya's Clay Studio",
        price_cents: 2_800,
        category: "ceramics",
        description: "A handmade ceramic mug.",
        image_url: null,
        product_url: "https://agentshelf.test/s/maya-clay/p/11111111-1111-4111-8111-111111111111",
      },
      reason: "Fits the request.",
    } as const;
    const events: ShopperEvent[] = [
      picked,
      { type: "shop_message", text: "I can offer $27.16.", action: "offer", offer_cents: 2_716, round: 1 },
      { type: "buyer_message", text: "Would you consider $22?", move: "counter", price_cents: 2_200 },
      { type: "shop_message", text: "I can meet you at $23.80.", action: "offer", offer_cents: 2_380, round: 2 },
      { type: "buyer_message", text: "Deal.", move: "accept", price_cents: 2_380 },
      { type: "shop_message", text: "Accepted at $23.80.", action: "accept", offer_cents: 2_380, round: 3 },
    ];

    expect(buildPriceNodes(events).map((node) => [node.label, node.cents])).toEqual([
      ["List price", 2_800],
      ["Shop offer", 2_716],
      ["Your counter", 2_200],
      ["Agreed", 2_380],
    ]);
  });
});
