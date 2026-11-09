import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("normalizes a shop name into a URL-safe slug", () => {
    expect(slugify("  Fresh Mug & Clay!  ")).toBe("fresh-mug-clay");
  });
});
