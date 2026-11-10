import { createHash, timingSafeEqual } from "node:crypto";

export type PassOwnerPair = { passId: string; ownerKey: string };

const passIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ownerKeyPattern = /^[A-Za-z0-9_-]{43}$/;
const agentPassTokenPattern = /^asp_[A-Za-z0-9_-]{43}$/;

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function isAgentPassToken(value: string): boolean {
  return agentPassTokenPattern.test(value);
}

export function parsePassOwnerCookie(value: string | undefined): PassOwnerPair[] {
  if (!value || value.length > 4_000) return [];
  return value.split("~").slice(-5).flatMap((entry) => {
    const separator = entry.indexOf(".");
    if (separator < 0) return [];
    const passId = entry.slice(0, separator);
    const ownerKey = entry.slice(separator + 1);
    if (!passIdPattern.test(passId) || !ownerKeyPattern.test(ownerKey)) return [];
    return [{ passId, ownerKey }];
  });
}

export function serializePassOwnerCookie(entries: PassOwnerPair[]): string {
  const recent = entries.slice(-5);
  return recent.map(({ passId, ownerKey }) => `${passId}.${ownerKey}`).join("~");
}

export function addPassOwnerPair(entries: PassOwnerPair[], pair: PassOwnerPair): PassOwnerPair[] {
  return [...entries.filter((entry) => entry.passId !== pair.passId), pair].slice(-5);
}

export function ownerKeyMatches(ownerKey: string | undefined, expectedHash: string): boolean {
  if (!ownerKey || !ownerKeyPattern.test(ownerKey) || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(sha256(ownerKey), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
