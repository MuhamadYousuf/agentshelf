import { describe, expect, it, vi } from "vitest";
import { ordersFeedResponse } from "./orders-feed-http";
import { makeMerchantOrderRow } from "./orders-feed";

const orderRow = makeMerchantOrderRow({
  id: "order-1",
  createdAt: new Date("2026-11-11T11:00:00.000Z"),
  updatedAt: new Date("2026-11-11T11:01:00.000Z"),
  title: "Speckled Mug",
  imageId: "image-1",
  qty: 1,
  amountCents: 2_380,
  listPriceCents: 2_800,
  agentClient: "AgentShelf Shopper",
  flow: "agent_pass",
  status: "completed",
  payoutStatus: "SUCCESS",
  captureId: "capture-1",
  tracking: null,
  negotiationId: "neg-1",
  rounds: 3,
  isDemo: false,
  shipping: { address: { city: "Lahore", countryCode: "PK" } },
});

describe("merchant orders feed route", () => {
  it("requires a session", async () => {
    const response = await ordersFeedResponse(new Request("http://localhost/api/merchant/orders"), {
      getSession: async () => null,
      listOrders: vi.fn(async () => []),
      now: () => new Date("2026-11-11T11:00:00.000Z"),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("passes the authenticated merchant scope and since cursor to the query", async () => {
    const listOrders = vi.fn(async (merchantId: string, options: { since?: Date }) =>
      merchantId === "merchant-2" && options.since ? [orderRow] : [],
    );
    const response = await ordersFeedResponse(
      new Request("http://localhost/api/merchant/orders?since=2026-11-11T10%3A00%3A00.000Z"),
      {
        getSession: async () => ({ merchantId: "merchant-2" }),
        listOrders,
        now: () => new Date("2026-11-11T11:02:00.000Z"),
      },
    );
    const body = await response.json() as { orders: Array<Record<string, unknown>>; nextSince: string };
    expect(listOrders).toHaveBeenCalledWith("merchant-2", { since: new Date("2026-11-11T10:00:00.000Z") });
    expect(body.orders[0]).toMatchObject({ id: "order-1", channel: "agent", shippingCity: "Lahore" });
    expect(body.orders[0]).not.toHaveProperty("buyerEmail");
    expect(body.orders[0]).not.toHaveProperty("shippingStreet");
    expect(body.nextSince).toBe("2026-11-11T11:02:00.000Z");
  });

  it("rejects invalid since cursors", async () => {
    const response = await ordersFeedResponse(new Request("http://localhost/api/merchant/orders?since=tomorrow"), {
      getSession: async () => ({ merchantId: "merchant-1" }),
      listOrders: vi.fn(async () => []),
      now: () => new Date("2026-11-11T11:00:00.000Z"),
    });
    expect(response.status).toBe(400);
  });
});
