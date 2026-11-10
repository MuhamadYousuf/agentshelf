import "server-only";

import sharp from "sharp";

export type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp";

export type ProcessedImage = {
  bytes: Buffer;
  width: number;
  height: number;
  mime: "image/webp";
};

export function detectImageMime(bytes: Uint8Array): SupportedImageMime | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    Buffer.from(bytes.subarray(1, 4)).toString("ascii") === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export async function processProductImage(bytes: Uint8Array): Promise<ProcessedImage> {
  const input = Buffer.from(bytes);
  const detectedMime = detectImageMime(input);
  if (!detectedMime) throw new Error("Use a JPEG, PNG, or WebP photo.");

  const { data, info } = await sharp(input, { failOn: "error", limitInputPixels: 40_000_000 })
    .rotate()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  return { bytes: data, width: info.width, height: info.height, mime: "image/webp" };
}
