import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  addPassOwnerPair,
  isAgentPassToken,
  ownerKeyMatches,
  parsePassOwnerCookie,
  serializePassOwnerCookie,
  sha256,
} from "./security";

const passIds = [
  "94d0313a-2f22-46fc-8392-8a0fb5b40811",
  "dfc4e049-1389-4c91-8c6e-d43d3bdcab25",
  "a09aa7b2-5df0-4f50-960f-53199a4bd0ad",
  "e32bc105-26de-44af-9c45-7f9e44a2e1a8",
  "a5130e8a-d2d5-46ce-8b7b-8402b32ae588",
  "b8227ac6-e56b-452c-a2c8-15c594bb55b5",
];

const key = () => randomBytes(32).toString("base64url");

describe("Agent Pass capability storage", () => {
  it("keeps at most five owner keys and verifies only the hash", () => {
    const pairs = passIds.map((passId) => ({ passId, ownerKey: key() }));
    const parsed = parsePassOwnerCookie(serializePassOwnerCookie(pairs));
    expect(parsed).toHaveLength(5);
    const newest = parsed.at(-1);
    expect(newest).toBeDefined();
    expect(ownerKeyMatches(newest?.ownerKey, sha256(newest?.ownerKey ?? ""))).toBe(true);
    expect(ownerKeyMatches(newest?.ownerKey, sha256(key()))).toBe(false);
  });

  it("replaces an entry for the same pass and ignores malformed input", () => {
    const first = { passId: passIds[0]!, ownerKey: key() };
    const second = { passId: passIds[0]!, ownerKey: key() };
    expect(addPassOwnerPair([first], second)).toEqual([second]);
    expect(parsePassOwnerCookie("not-a-pair~also.bad" )).toEqual([]);
  });

  it("accepts only the generated bearer-token format", () => {
    expect(isAgentPassToken(`asp_${key()}`)).toBe(true);
    expect(isAgentPassToken("asp_not-a-token")).toBe(false);
  });
});
