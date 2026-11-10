import "server-only";

import { cookies } from "next/headers";
import { getAppUrl } from "@/lib/env";
import {
  addPassOwnerPair,
  ownerKeyMatches,
  parsePassOwnerCookie,
  serializePassOwnerCookie,
  type PassOwnerPair,
} from "./security";

export const PASS_OWNER_COOKIE = "agentshelf_pass_owner";
export const PASS_FLASH_COOKIE = "agentshelf_pass_flash";

function secureCookie(): boolean {
  return new URL(getAppUrl()).protocol === "https:";
}

export async function rememberPassOwner(pair: PassOwnerPair): Promise<void> {
  const cookieStore = await cookies();
  const existing = parsePassOwnerCookie(cookieStore.get(PASS_OWNER_COOKIE)?.value);
  const next = addPassOwnerPair(existing, pair);
  cookieStore.set(PASS_OWNER_COOKIE, serializePassOwnerCookie(next), {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

export async function passOwnerKey(passId: string): Promise<string | undefined> {
  const value = (await cookies()).get(PASS_OWNER_COOKIE)?.value;
  return parsePassOwnerCookie(value).find((entry) => entry.passId === passId)?.ownerKey;
}

export async function isPassOwner(passId: string, ownerKeyHash: string): Promise<boolean> {
  return ownerKeyMatches(await passOwnerKey(passId), ownerKeyHash);
}

export async function setPassFlash(passId: string, token: string): Promise<void> {
  (await cookies()).set(PASS_FLASH_COOKIE, `${passId}.${token}`, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/api/pass/token",
    maxAge: 60,
  });
}
