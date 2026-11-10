import { describe, expect, it } from "vitest";
import { detectImageMime } from "./process";

describe("detectImageMime", () => {
  it("detects real JPEG, PNG, and WebP magic bytes", () => {
    expect(detectImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(detectImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
  });

  it("rejects renamed text and incomplete signatures", () => {
    expect(detectImageMime(new TextEncoder().encode("plain text disguised as .jpg"))).toBeNull();
    expect(detectImageMime(Uint8Array.from([0xff, 0xd8]))).toBeNull();
  });
});
