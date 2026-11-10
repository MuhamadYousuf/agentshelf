import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrRecoverCatalogProduct } from "./catalog";
import { resetPaypalTokenCacheForTests } from "./client";

vi.mock("@/lib/env", () => ({
  getAppUrl: () => "http://localhost:3000",
  getPaypalConfiguration: () => ({
    environment: "sandbox",
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
  }),
}));

const tokenResponse = () =>
  new Response(JSON.stringify({ access_token: "test-access-token", expires_in: 3_600 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const input = {
  id: "product-123",
  name: "Speckled ceramic mug",
  description: "A hand-glazed mug with a speckled beige finish.",
  type: "PHYSICAL" as const,
  category: "ceramics",
  imageUrl: "http://localhost:3000/api/images/image-1",
  homeUrl: "http://localhost:3000/s/maya-clay",
};

describe("PayPal Catalog retry recovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetPaypalTokenCacheForTests();
  });

  it("recovers an already-created matching product after a duplicate-id response", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        name: "UNPROCESSABLE_ENTITY",
        message: "The product id already exists.",
        details: [{ issue: "DUPLICATE_RESOURCE_IDENTIFIER", field: "/id" }],
      }), { status: 422 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: input.id,
        name: input.name,
        description: input.description,
        type: input.type,
        create_time: "2026-11-10T00:00:00Z",
        update_time: "2026-11-10T00:00:00Z",
        links: [],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const product = await createOrRecoverCatalogProduct(input);

    expect(product.id).toBe(input.id);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("GET");
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toBeDefined();
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('"id":"product-123"');
  });

  it("does not associate a different existing PayPal product with the listing", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        name: "UNPROCESSABLE_ENTITY",
        message: "The product id already exists.",
        details: [{ issue: "DUPLICATE_RESOURCE_IDENTIFIER", field: "/id" }],
      }), { status: 422 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: input.id,
        name: "A different product",
        description: input.description,
        type: input.type,
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createOrRecoverCatalogProduct(input)).rejects.toMatchObject({
      name: "UNPROCESSABLE_ENTITY",
      status: 422,
    });
  });
});
