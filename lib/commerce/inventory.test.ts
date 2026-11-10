import { describe, expect, it } from "vitest";
import { canReserve } from "./inventory";

describe("inventory reservation guard", () => {
  it("matches the atomic stock minus reserved guard", () => {
    expect(canReserve(5, 2, 3)).toBe(true);
    expect(canReserve(5, 2, 4)).toBe(false);
    expect(canReserve(0, 0, 1)).toBe(false);
    expect(canReserve(5, 0, 0)).toBe(false);
  });
});
