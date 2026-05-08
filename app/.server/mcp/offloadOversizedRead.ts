import { basename } from "path";
import { createHash } from "crypto";
import { getPlatformDefaultClient } from "../storage";
import { detectMime, safeImageBlock, type McpContentBlock } from "./safeImageBlock";
import type { AuthContext } from "../apiAuth";

const INLINE_TEXT_MAX_BYTES = 50 * 1024;
const INLINE_IMAGE_MAX_BYTES = 1 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 3600;

type SandboxReadResult = {
  content: string;
  size: number;
  encoding: string;
};

type ToolResponse = { content: McpContentBlock[] };

/**
 * Decide how to return the result of `sandbox_files_read` to the MCP client
 * without poisoning the consuming agent's context window.
 *
 * Rules:
 *   1. utf8 text < 50KB → inline JSON (legacy behavior).
 *   2. Recognized image (PNG/JPEG/GIF/WebP) under 1MB → MCP `image` block so
 *      the model can see it natively.
 *   3. Everything else → upload to private platform bucket and return a
 *      7-day signed URL plus metadata, as a single `text` block.
 */
export async function offloadOversizedRead(
  ctx: AuthContext,
  result: SandboxReadResult,
  sandboxPath: string
): Promise<ToolResponse> {
  const isUtf8 = result.encoding === "utf8";

  if (isUtf8 && result.content.length < INLINE_TEXT_MAX_BYTES) {
    return {
      content: [
        { type: "text", text: JSON.stringify(result, null, 2) },
      ],
    };
  }

  const buf = isUtf8
    ? Buffer.from(result.content, "utf8")
    : Buffer.from(result.content, "base64");

  const detectedMime = detectMime(buf);
  if (detectedMime && buf.length < INLINE_IMAGE_MAX_BYTES) {
    return {
      content: [safeImageBlock(buf, detectedMime, "sandbox_files_read")],
    };
  }

  const sha256 = createHash("sha256").update(buf).digest("hex");
  const safeBase = basename(sandboxPath).replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
  const key = `sandbox-reads/${ctx.user.id}/${sha256}-${safeBase}`;
  const mime = detectedMime || guessMimeFromPath(sandboxPath) || "application/octet-stream";

  const storage = getPlatformDefaultClient();
  await storage.putObject(key, buf, mime);
  const url = await storage.getReadUrl(key, SIGNED_URL_TTL_SECONDS);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            url,
            size_bytes: buf.length,
            mime,
            sha256,
            expires_in_seconds: SIGNED_URL_TTL_SECONDS,
            note: "File too large for inline content; signed URL valid for 7 days.",
          },
          null,
          2
        ),
      },
    ],
  };
}

function guessMimeFromPath(path: string): string | null {
  const ext = path.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    csv: "text/csv",
    xml: "application/xml",
    pdf: "application/pdf",
    zip: "application/zip",
    tar: "application/x-tar",
    gz: "application/gzip",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    webm: "video/webm",
    ogg: "audio/ogg",
    wav: "audio/wav",
  };
  return map[ext] || null;
}
