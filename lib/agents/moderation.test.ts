import { describe, expect, it } from "vitest";
import { moderateListing } from "./moderation";

function check(title: string) {
  return moderateListing({ title, description: "Handmade item.", attributes: {}, tags: [] });
}

describe("moderateListing", () => {
  it.each([
    ["Handmade kitchen knife", "blocked"],
    ["CBD balm", "blocked"],
    ["Replica designer handbag", "blocked"],
    ["Adult video collection", "blocked"],
    ["Wine gift basket", "review"],
    ["Bitcoin gift card", "review"],
    ["Stolen property", "review"],
  ] as const)("flags %s", (title, status) => {
    expect(check(title).status).toBe(status);
  });

  it("matches whole words without flagging teapot", () => {
    expect(check("Hand-thrown teapot").status).toBe("allowed");
  });

  it("matches case variants and preserves the model verdict source", () => {
    const result = moderateListing({
      title: "CBD oil",
      description: "",
      attributes: {},
      tags: [],
      modelVerdict: "review",
      modelReasons: ["Check ingredients"],
    });
    expect(result.status).toBe("blocked");
    expect(result.source).toEqual(["model", "rules"]);
    expect(result.reasons).toContain("Check ingredients");
  });
});
