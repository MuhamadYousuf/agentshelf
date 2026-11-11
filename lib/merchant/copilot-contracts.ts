import { z } from "zod";

export const copilotRangeSchema = z.enum(["today", "7d", "30d"]);

const amountFilterSchema = z.object({
  min: z.number().int().min(0).max(5_000_000).optional().describe("Minimum order amount in USD cents."),
  max: z.number().int().min(0).max(5_000_000).optional().describe("Maximum order amount in USD cents."),
}).strict().refine((value) => value.min === undefined || value.max === undefined || value.min <= value.max, {
  message: "The minimum amount must not exceed the maximum amount.",
});

const dateFilterSchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
}).strict().refine((value) => value.from === undefined || value.to === undefined || value.from <= value.to, {
  message: "The start date must not be later than the end date.",
});

export const gridViewSchema = z.object({
  filters: z.object({
    channel: z.enum(["agent", "storefront"]).optional(),
    flow: z.enum(["approval_link", "agent_pass"]).optional(),
    status: z.enum(["created", "approval_required", "approved", "completed", "refunded", "failed"]).optional(),
    amount: amountFilterSchema.optional(),
    date: dateFilterSchema.optional(),
    agent_client: z.enum(["Claude Desktop", "AgentShelf Shopper", "Other MCP clients"]).optional(),
  }).strict().optional(),
  sort: z.object({
    columnId: z.enum(["createdAt", "title", "channel", "amountCents", "flow", "status", "agentClient"]),
    direction: z.enum(["asc", "desc"]),
  }).strict().optional(),
  quick_filter: z.string().trim().max(100).optional(),
}).strict();

export type CopilotRange = z.infer<typeof copilotRangeSchema>;
export type GridViewSpec = z.infer<typeof gridViewSchema>;

export type TextFilterModel = { filterType: "text"; type: "equals"; filter: string };
export type NumberFilterModel = {
  filterType: "number";
  type: "equals" | "greaterThanOrEqual" | "lessThanOrEqual" | "inRange";
  filter?: number;
  filterTo?: number;
};
export type DateFilterModel = {
  filterType: "date";
  type: "equals" | "greaterThanOrEqual" | "lessThanOrEqual" | "inRange";
  dateFrom: string;
  dateTo?: string;
};
export type MerchantGridFilterModel = Record<string, TextFilterModel | NumberFilterModel | DateFilterModel>;

export type GridViewModel = {
  filterModel: MerchantGridFilterModel;
  columnState: Array<{ colId: string; sort: "asc" | "desc"; sortIndex: number }>;
  quickFilterText: string;
};

export function gridViewToAgGridModel(view: GridViewSpec): GridViewModel {
  const filters = view.filters ?? {};
  const filterModel: MerchantGridFilterModel = {};
  if (filters.channel) filterModel.channel = { filterType: "text", type: "equals", filter: filters.channel };
  if (filters.flow) filterModel.flow = { filterType: "text", type: "equals", filter: filters.flow };
  if (filters.status) filterModel.status = { filterType: "text", type: "equals", filter: filters.status };
  if (filters.agent_client) {
    filterModel.agentClient = { filterType: "text", type: "equals", filter: filters.agent_client };
  }
  if (filters.amount) {
    const { min, max } = filters.amount;
    if (min !== undefined && max !== undefined) {
      filterModel.amountCents = { filterType: "number", type: "inRange", filter: min / 100, filterTo: max / 100 };
    } else if (min !== undefined) {
      filterModel.amountCents = { filterType: "number", type: "greaterThanOrEqual", filter: min / 100 };
    } else if (max !== undefined) {
      filterModel.amountCents = { filterType: "number", type: "lessThanOrEqual", filter: max / 100 };
    }
  }
  if (filters.date) {
    const { from, to } = filters.date;
    if (from && to) filterModel.createdAt = { filterType: "date", type: "inRange", dateFrom: from, dateTo: to };
    else if (from) filterModel.createdAt = { filterType: "date", type: "greaterThanOrEqual", dateFrom: from };
    else if (to) filterModel.createdAt = { filterType: "date", type: "lessThanOrEqual", dateFrom: to };
  }

  return {
    filterModel,
    columnState: view.sort ? [{ colId: view.sort.columnId, sort: view.sort.direction, sortIndex: 0 }] : [],
    quickFilterText: view.quick_filter ?? "",
  };
}

export type CopilotEffect =
  | { type: "grid_view"; view: GridViewSpec }
  | { type: "refund_confirmation"; orderId: string; summary: string; reason: string }
  | { type: "tracking_updated"; orderId: string; message: string };

export type CopilotResponse = { text: string; effects: CopilotEffect[] };
