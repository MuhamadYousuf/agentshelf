import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapNegotiationForGrid, type NegotiationGridRow } from "./negotiations-grid";

describe("negotiation grid helpers", () => {
  it("maps the opening offer, final amount, outcome, and strategy label", () => {
    expect(mapNegotiationForGrid({
      id: "n1", productTitle: "Hand-glazed mug", clientName: "AgentShelf Shopper",
      updatedAt: new Date("2026-11-12T01:00:00Z"), round: 3, status: "agreed", state: "recovery",
      listPriceCents: 2_800, lastOfferCents: 2_380,
      messages: [
        { role: "merchant", offerCents: 2_716 },
        { role: "buyer", offerCents: 2_200 },
      ],
    })).toEqual({
      id: "n1", time: "2026-11-12T01:00:00.000Z", product: "Hand-glazed mug", agentClient: "AgentShelf Shopper",
      rounds: 3, openingOfferCents: 2_716, finalPriceCents: 2_380, discountPct: 15,
      outcome: "deal", strategyState: "DEFECT_RECOVERY",
    });
  });

  it("keeps the merchant grid row type out of the MCP source tree", () => {
    const mcpDirectory = new URL("../mcp/", import.meta.url);
    const sources = readdirSync(mcpDirectory).filter((file) => file.endsWith(".ts"));
    const sourceText = sources.map((file) => readFileSync(new URL(file, mcpDirectory), "utf8")).join("\n");
    expect(sourceText).not.toContain("NegotiationGridRow");
    expect(sourceText).not.toContain("merchant/negotiations-grid");
    const rowType: NegotiationGridRow = {
      id: "n1", time: "", product: "", agentClient: "", rounds: 0, openingOfferCents: null,
      finalPriceCents: null, discountPct: null, outcome: "open", strategyState: "COOPERATE",
    };
    expect(rowType).not.toHaveProperty("floorPriceCents");
    expect(rowType).not.toHaveProperty("costCents");
  });
});
