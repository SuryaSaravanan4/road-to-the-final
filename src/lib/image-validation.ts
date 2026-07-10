/**
 * Server-side image validation for screenshot uploads. The client-declared
 * MIME type is never trusted: the actual bytes are sniffed (magic numbers)
 * and the pixel dimensions are read from the format header — without
 * decoding the image — so a mislabeled file or a decompression bomb is
 * rejected before it is stored or sent to the Claude API.
 */

export type SniffedMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export interface ImageInfo {
  mediaType: SniffedMediaType;
  width: number;
  height: number;
}

/** Claude vision's per-dimension limit; anything larger is rejected here. */
export const MAX_IMAGE_DIMENSION = 8000;

function u16be(bytes: Uint8Array, at: number): number {
  return (bytes[at] << 8) | bytes[at + 1];
}

function u16le(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8);
}

function u24le(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
}

function u32be(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

function ascii(bytes: Uint8Array, at: number, text: string): boolean {
  if (at + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[at + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function sniffPng(bytes: Uint8Array): ImageInfo | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((b, i) => bytes[i] === b)) return null;
  if (!ascii(bytes, 12, "IHDR")) return null;
  return { mediaType: "image/png", width: u32be(bytes, 16), height: u32be(bytes, 20) };
}

function sniffJpeg(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;

  // Walk the segment list to a start-of-frame marker, which carries the
  // dimensions. C4/C8/CC look like SOF markers but aren't.
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    let marker = bytes[i + 1];
    while (marker === 0xff && i + 2 < bytes.length) {
      i++;
      marker = bytes[i + 1];
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { mediaType: "image/jpeg", width: u16be(bytes, i + 7), height: u16be(bytes, i + 5) };
    }
    if (marker >= 0xd0 && marker <= 0xd9) {
      i += 2; // standalone marker, no length field
    } else {
      i += 2 + u16be(bytes, i + 2);
    }
  }
  return null;
}

function sniffGif(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 10 || (!ascii(bytes, 0, "GIF87a") && !ascii(bytes, 0, "GIF89a"))) return null;
  return { mediaType: "image/gif", width: u16le(bytes, 6), height: u16le(bytes, 8) };
}

function sniffWebp(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 30 || !ascii(bytes, 0, "RIFF") || !ascii(bytes, 8, "WEBP")) return null;

  if (ascii(bytes, 12, "VP8X")) {
    return {
      mediaType: "image/webp",
      width: 1 + u24le(bytes, 24),
      height: 1 + u24le(bytes, 27),
    };
  }
  if (ascii(bytes, 12, "VP8 ")) {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return {
      mediaType: "image/webp",
      width: u16le(bytes, 26) & 0x3fff,
      height: u16le(bytes, 28) & 0x3fff,
    };
  }
  if (ascii(bytes, 12, "VP8L")) {
    if (bytes[20] !== 0x2f) return null;
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      mediaType: "image/webp",
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  return null;
}

/** Returns the image's real type and dimensions, or null if the bytes are
 * not a supported image format. */
export function sniffImage(bytes: Uint8Array): ImageInfo | null {
  return sniffPng(bytes) ?? sniffJpeg(bytes) ?? sniffGif(bytes) ?? sniffWebp(bytes);
}

/** Human-readable rejection reason, or null when the image is acceptable. */
export function validateScreenshot(bytes: Uint8Array, maxBytes: number): string | null {
  if (bytes.length > maxBytes) {
    return `Image is too large (${bytes.length} bytes; max ${maxBytes}).`;
  }
  const info = sniffImage(bytes);
  if (!info) {
    return "File is not a recognizable PNG, JPEG, WebP, or GIF image.";
  }
  if (info.width < 1 || info.height < 1) {
    return "Image has invalid dimensions.";
  }
  if (info.width > MAX_IMAGE_DIMENSION || info.height > MAX_IMAGE_DIMENSION) {
    return `Image dimensions ${info.width}×${info.height} exceed the ${MAX_IMAGE_DIMENSION}px limit.`;
  }
  return null;
}
