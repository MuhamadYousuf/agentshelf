import { describe, expect, it } from "vitest";
import { availableStock } from "@/lib/commerce/policy";
import { rankSearchRows, searchMatchRank, type SearchMatchFields } from "./search";

describe("MCP product search helpers", () => {
  const rows: Array<SearchMatchFields & { id: string }> = [
    { id: "description", title: "Blue cup", description: "A hand-built stoneware mug", tags: [], category: "ceramics" },
    { id: "category", title: "Speckled vessel", description: "Wheel-thrown pottery", tags: [], category: "mug accessories" },
    { id: "tag", title: "Small vessel", description: "A handmade piece", tags: ["coffee mug"], category: "ceramics" },
    { id: "title", title: "Hand-glazed mug", description: "A handmade piece", tags: [], category: "ceramics" },
  ];

  it("ranks title above tags above descriptions and categories", () => {
    expect(searchMatchRank("mug", rows[3]!)).toBe(0);
    expect(searchMatchRank("mug", rows[2]!)).toBe(1);
    expect(searchMatchRank("mug", rows[0]!)).toBe(2);
    expect(searchMatchRank("mug", rows[1]!)).toBe(2);
    expect(rankSearchRows(rows, "mug").map((row) => row.id)).toEqual([
      "title",
      "tag",
      "description",
      "category",
    ]);
  });

  it("calculates only unreserved inventory as available", () => {
    expect(availableStock({ stock: 8, reserved: 3 })).toBe(5);
    expect(availableStock({ stock: 4, reserved: 7 })).toBe(0);
  });
});
