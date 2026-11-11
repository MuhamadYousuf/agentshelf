import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { describeGridView } = await import("./copilot");

describe("describeGridView", () => {
  it("summarizes channel, amount and sort in plain words", () => {
    expect(describeGridView({ filters: { channel: "agent", amount: { min: 2000 } }, sort: { columnId: "amountCents", direction: "desc" } }))
      .toBe("Done. The grid now shows orders from AI agents, of $20.00 or more, sorted by amount (descending). Use Clear above the grid to reset it.");
  });

  it("prefers the named agent client and handles ranges", () => {
    expect(describeGridView({ filters: { channel: "agent", agent_client: "Claude Desktop", amount: { min: 1000, max: 3000 } } }))
      .toBe("Done. The grid now shows orders from Claude Desktop, between $10.00 and $30.00. Use Clear above the grid to reset it.");
  });

  it("has a neutral sentence for an empty view", () => {
    expect(describeGridView({})).toBe("Done. The grid view is updated. Use Clear above the grid to reset it.");
  });
});
