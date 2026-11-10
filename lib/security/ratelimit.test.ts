import { describe, expect, it } from "vitest";
import { fixedWindowStart } from "./ratelimit";

describe("fixedWindowStart", () => {
  it("aligns times to the start of their fixed window", () => {
    expect(fixedWindowStart(3_599_999, 3_600_000)).toBe(0);
    expect(fixedWindowStart(3_600_000, 3_600_000)).toBe(3_600_000);
  });

  it("rejects invalid window durations", () => {
    expect(() => fixedWindowStart(0, 0)).toThrow(RangeError);
  });
});
