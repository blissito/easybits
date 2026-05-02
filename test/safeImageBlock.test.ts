import { describe, it, expect } from "vitest";
import { safeImageBlock } from "../app/.server/mcp/safeImageBlock";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const GIF89A_HEADER = Buffer.from("GIF89a", "ascii");
const WEBP_HEADER = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("WEBP", "ascii"),
]);

function pad(header: Buffer, size = 256): Buffer {
  return Buffer.concat([header, Buffer.alloc(size - header.length, 0)]);
}

describe("safeImageBlock", () => {
  it("returns image block for valid PNG buffer", () => {
    const block = safeImageBlock(pad(PNG_HEADER), "image/png", "test");
    expect(block.type).toBe("image");
    if (block.type === "image") {
      expect(block.mimeType).toBe("image/png");
      expect(block.data).toBe(pad(PNG_HEADER).toString("base64"));
    }
  });

  it("returns image block for valid JPEG", () => {
    const block = safeImageBlock(pad(JPEG_HEADER), "image/jpeg", "test");
    expect(block.type).toBe("image");
    if (block.type === "image") expect(block.mimeType).toBe("image/jpeg");
  });

  it("accepts base64 string input", () => {
    const b64 = pad(PNG_HEADER).toString("base64");
    const block = safeImageBlock(b64, "image/png", "test");
    expect(block.type).toBe("image");
    if (block.type === "image") expect(block.data).toBe(b64);
  });

  it("auto-corrects mime when declared does not match magic bytes", () => {
    const block = safeImageBlock(pad(PNG_HEADER), "image/jpeg", "test");
    expect(block.type).toBe("image");
    if (block.type === "image") expect(block.mimeType).toBe("image/png");
  });

  it("returns text fallback for buffer below minimum size", () => {
    const block = safeImageBlock(PNG_HEADER, "image/png", "tiny");
    expect(block.type).toBe("text");
    if (block.type === "text") {
      expect(block.text).toContain("[tiny failed:");
      expect(block.text).toContain("too small");
    }
  });

  it("returns text fallback for empty buffer", () => {
    const block = safeImageBlock(Buffer.alloc(0), "image/png", "empty");
    expect(block.type).toBe("text");
    if (block.type === "text") expect(block.text).toContain("too small");
  });

  it("returns text fallback for unrecognized bytes", () => {
    const garbage = Buffer.alloc(512, 0x42);
    const block = safeImageBlock(garbage, "image/png", "garbage");
    expect(block.type).toBe("text");
    if (block.type === "text") expect(block.text).toContain("unrecognized");
  });

  it("recognizes GIF89a", () => {
    const block = safeImageBlock(pad(GIF89A_HEADER), "image/gif", "test");
    expect(block.type).toBe("image");
    if (block.type === "image") expect(block.mimeType).toBe("image/gif");
  });

  it("recognizes WebP", () => {
    const block = safeImageBlock(pad(WEBP_HEADER), "image/webp", "test");
    expect(block.type).toBe("image");
    if (block.type === "image") expect(block.mimeType).toBe("image/webp");
  });

  it("uses default label when none provided", () => {
    const block = safeImageBlock(Buffer.alloc(0), "image/png");
    expect(block.type).toBe("text");
    if (block.type === "text") expect(block.text).toContain("[image failed:");
  });
});
