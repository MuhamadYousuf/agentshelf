import { describe, expect, it } from "vitest";
import { gridViewSchema, gridViewToAgGridModel } from "./copilot-contracts";

describe("Copilot grid view mapping", () => {
  it("maps each supported filter to its Community column ID", () => {
    const view = gridViewSchema.parse({
      filters: {
        channel: "agent",
        flow: "agent_pass",
        status: "completed",
        amount: { min: 2_000, max: 5_000 },
        date: { from: "2026-11-01", to: "2026-11-07" },
        agent_client: "Claude Desktop",
      },
      sort: { columnId: "amountCents", direction: "desc" },
      quick_filter: "Claude",
    });
    expect(gridViewToAgGridModel(view)).toEqual({
      filterModel: {
        channel: { filterType: "text", type: "equals", filter: "agent" },
        flow: { filterType: "text", type: "equals", filter: "agent_pass" },
        status: { filterType: "text", type: "equals", filter: "completed" },
        amountCents: { filterType: "number", type: "inRange", filter: 20, filterTo: 50 },
        createdAt: { filterType: "date", type: "inRange", dateFrom: "2026-11-01", dateTo: "2026-11-07" },
        agentClient: { filterType: "text", type: "equals", filter: "Claude Desktop" },
      },
      columnState: [{ colId: "amountCents", sort: "desc", sortIndex: 0 }],
      quickFilterText: "Claude",
    });
  });

  it("maps one-sided amount and date ranges", () => {
    const model = gridViewToAgGridModel(gridViewSchema.parse({
      filters: { amount: { min: 2_000 }, date: { from: "2026-11-01" } },
    }));
    expect(model.filterModel.amountCents).toEqual({ filterType: "number", type: "greaterThanOrEqual", filter: 20 });
    expect(model.filterModel.createdAt).toEqual({ filterType: "date", type: "greaterThanOrEqual", dateFrom: "2026-11-01" });
  });

  it("rejects unknown filter and sort columns", () => {
    expect(gridViewSchema.safeParse({ filters: { paypal_secret: "x" } }).success).toBe(false);
    expect(gridViewSchema.safeParse({ sort: { columnId: "paypal_secret", direction: "asc" } }).success).toBe(false);
  });
});
