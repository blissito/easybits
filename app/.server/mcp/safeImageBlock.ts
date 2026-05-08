export type McpImageBlock = { type: "image"; data: string; mimeType: string };
export type McpTextBlock = { type: "text"; text: string };
export type McpContentBlock = McpImageBlock | McpTextBlock;

const MIN_IMAGE_BYTES = 100;

type Signature = { mime: string; matches: (b: Buffer) => boolean };

const SIGNATURES: Signature[] = [
  {
    mime: "image/png",
    matches: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mime: "image/jpeg",
    matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/gif",
    matches: (b) =>
      b.length >= 6 &&
      b[0] === 0x47 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) &&
      b[5] === 0x61,
  },
  {
    mime: "image/webp",
    matches: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

export function detectMime(buf: Buffer): string | null {
  for (const sig of SIGNATURES) {
    if (sig.matches(buf)) return sig.mime;
  }
  return null;
}

/**
 * Wrap raw image bytes in a content block, validating magic bytes against the declared mime.
 * If the buffer is too small or has no recognized signature, returns a text fallback so a
 * malformed image cannot poison the Anthropic SDK session with a 400 invalid_request_error.
 * If the detected mime differs from `declaredMime`, the detected one wins (sniff > assumption).
 */
export function safeImageBlock(
  data: string | Buffer,
  declaredMime: string,
  label = "image"
): McpContentBlock {
  let buf: Buffer;
  let base64: string;

  if (Buffer.isBuffer(data)) {
    buf = data;
    base64 = data.toString("base64");
  } else if (typeof data === "string") {
    base64 = data;
    try {
      buf = Buffer.from(data, "base64");
    } catch {
      return { type: "text", text: `[${label} failed: base64 decode error]` };
    }
  } else {
    return { type: "text", text: `[${label} failed: invalid data type]` };
  }

  if (buf.length < MIN_IMAGE_BYTES) {
    return {
      type: "text",
      text: `[${label} failed: image too small (${buf.length} bytes)]`,
    };
  }

  const detected = detectMime(buf);
  if (!detected) {
    return {
      type: "text",
      text: `[${label} failed: unrecognized image format]`,
    };
  }

  return { type: "image", data: base64, mimeType: detected };
}
