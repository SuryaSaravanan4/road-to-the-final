import { describe, expect, it } from "vitest";
import { MAX_IMAGE_DIMENSION, sniffImage, validateScreenshot } from "@/lib/image-validation";

/** Minimal but structurally valid format headers. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  // SOI, APP0 (minimal), SOF0 with dimensions.
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0, length 4
    0xff, 0xc0, 0x00, 0x0b, 0x08, // SOF0, length 11, precision 8
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x00, 0x00, 0x00, // 1 component
  ]);
}

function gif(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(13);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // "GIF89a"
  bytes[6] = width & 0xff;
  bytes[7] = (width >> 8) & 0xff;
  bytes[8] = height & 0xff;
  bytes[9] = (height >> 8) & 0xff;
  return bytes;
}

function webpVp8x(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;
  return bytes;
}

describe("sniffImage", () => {
  it("reads PNG dimensions from IHDR", () => {
    expect(sniffImage(png(640, 480))).toEqual({ mediaType: "image/png", width: 640, height: 480 });
  });

  it("walks JPEG segments to the SOF marker", () => {
    expect(sniffImage(jpeg(1024, 768))).toEqual({
      mediaType: "image/jpeg",
      width: 1024,
      height: 768,
    });
  });

  it("reads GIF dimensions", () => {
    expect(sniffImage(gif(320, 200))).toEqual({ mediaType: "image/gif", width: 320, height: 200 });
  });

  it("reads WebP VP8X canvas dimensions", () => {
    expect(sniffImage(webpVp8x(800, 600))).toEqual({
      mediaType: "image/webp",
      width: 800,
      height: 600,
    });
  });

  it("rejects bytes that are not a supported image, regardless of any claimed type", () => {
    expect(sniffImage(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("<html>not an image</html>"))).toBeNull();
    // PDF magic — a common mislabeled upload.
    expect(sniffImage(new TextEncoder().encode("%PDF-1.7 ..."))).toBeNull();
  });

  it("rejects truncated headers instead of reading out of bounds", () => {
    expect(sniffImage(png(640, 480).slice(0, 10))).toBeNull();
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

describe("validateScreenshot", () => {
  it("accepts a normal screenshot", () => {
    expect(validateScreenshot(png(1920, 1080), 5 * 1024 * 1024)).toBeNull();
  });

  it("rejects oversized byte length", () => {
    expect(validateScreenshot(png(100, 100), 10)).toMatch(/too large/);
  });

  it("rejects decompression-bomb dimensions", () => {
    expect(validateScreenshot(png(MAX_IMAGE_DIMENSION + 1, 100), 5 * 1024 * 1024)).toMatch(
      /exceed/
    );
  });

  it("rejects zero-dimension images", () => {
    expect(validateScreenshot(png(0, 100), 5 * 1024 * 1024)).toMatch(/invalid dimensions/);
  });

  it("rejects non-image bytes", () => {
    expect(validateScreenshot(new TextEncoder().encode("plain text"), 5 * 1024 * 1024)).toMatch(
      /not a recognizable/
    );
  });
});
