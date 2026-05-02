/**
 * Clone or reimagine documents from any visual source (image, PDF, another doc).
 * Outputs a Landing v4 (document) with Gemini Vision driving the per-page HTML.
 *
 * - mode "clone"     → faithful reproduction at the requested pageFormat.
 * - mode "reimagine" → uses the source as structural/conceptual reference and
 *                       applies the requested brand direction (colors, fonts, mood).
 *
 * Background-generates pages serially. Returns the new documentId immediately so
 * the agent can poll with get_document while pages stream in.
 */
import { nanoid } from "nanoid";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { getReadClientForPlatformFile, getClientForFile } from "../storage";
import { streamText } from "ai";
import { resolveModelLocal } from "../aiModels";
import { pdfToImages, type PdfPage } from "./pdfToImages";
import { resolveBrandKit, brandKitToDirection } from "./brandKitOperations";
import { takeDocumentScreenshot } from "./documentScreenshot";
import {
  resolveFormat,
  detectIntent,
  type SocialPresetKey,
  type FormatInput,
} from "./socialPresets";
import { enrichImages } from "../images/enrichImages";

const CLONE_MODEL = "gemini-2.5-pro";

type Mode = "clone" | "reimagine";

export type CloneSource =
  | { type: "image"; url: string }
  | { type: "pdf"; fileId: string; pages?: number[] }
  | { type: "document"; documentId: string };

export interface CloneDocumentOpts {
  source: CloneSource;
  name: string;
  pageFormat?: SocialPresetKey | FormatInput;
  mode?: Mode;
  brandKitId?: string;
  instruction?: string;
  maxPages?: number;
}

function throwJson(error: string, status: number): never {
  throw new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getModel(modelId?: string) {
  return resolveModelLocal(modelId || CLONE_MODEL);
}

function cleanHtmlResponse(text: string): string {
  let html = text.trim();
  if (html.startsWith("```")) {
    html = html.replace(/^```(?:html)?\n?/, "").replace(/\n?```$/, "");
  }
  return html.trim();
}

/**
 * Decode a data URL ("data:image/png;base64,...") or fetch a remote URL into
 * a base64 string + dimensions. Dimensions are inferred from PNG/JPEG headers
 * when available; otherwise fall back to the requested format dims.
 */
async function imageUrlToPage(url: string, fallback: { width: number; height: number }): Promise<PdfPage> {
  let buf: Buffer;
  if (url.startsWith("data:")) {
    const commaIdx = url.indexOf(",");
    if (commaIdx === -1) throwJson("Invalid data URL", 400);
    buf = Buffer.from(url.slice(commaIdx + 1), "base64");
  } else {
    const res = await fetch(url);
    if (!res.ok) throwJson(`Failed to fetch image: ${res.status}`, 400);
    buf = Buffer.from(await res.arrayBuffer());
  }
  // Best-effort dimension parsing
  const dims = readImageDimensions(buf) || fallback;
  return { image: buf.toString("base64"), width: dims.width, height: dims.height };
}

/** Parse width/height from PNG (IHDR) or JPEG (SOF) headers. Returns null on failure. */
function readImageDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG: 8-byte sig + 4-byte len + "IHDR" + width(4) + height(4)
  if (buf.length >= 24 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: scan for SOF0/SOF2 marker
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      const segLen = buf.readUInt16BE(i + 2);
      i += 2 + segLen;
    }
  }
  return null;
}

async function resolveSource(
  ctx: AuthContext,
  source: CloneSource,
  fallback: { width: number; height: number },
  maxPages: number
): Promise<{ pages: PdfPage[]; sourceName: string }> {
  if (source.type === "image") {
    const page = await imageUrlToPage(source.url, fallback);
    return { pages: [page], sourceName: "image" };
  }

  if (source.type === "pdf") {
    const file = await db.file.findUnique({ where: { id: source.fileId } });
    if (!file || file.ownerId !== ctx.user.id) throwJson("PDF file not found", 404);
    if (!file.contentType?.includes("pdf")) throwJson("File must be a PDF", 400);

    const client = file.storageProviderId
      ? await getClientForFile(file.storageProviderId, ctx.user.id)
      : getReadClientForPlatformFile(file);
    const readUrl = await client.getReadUrl(file.storageKey);
    const pdfRes = await fetch(readUrl);
    if (!pdfRes.ok) throwJson("Failed to read PDF", 500);
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    let pages = await pdfToImages(pdfBuffer, { maxPages });
    if (source.pages?.length) {
      const wanted = new Set(source.pages.map((n) => n - 1));
      pages = pages.filter((_, idx) => wanted.has(idx));
    }
    if (pages.length === 0) throwJson("PDF produced no pages", 400);
    return { pages, sourceName: file.name };
  }

  // type === "document"
  const sourceDoc = await db.landing.findUnique({ where: { id: source.documentId } });
  if (!sourceDoc || sourceDoc.ownerId !== ctx.user.id || sourceDoc.version !== 4) {
    throwJson("Source document not found", 404);
  }
  const sections = ((sourceDoc.sections || []) as Array<{ id: string }>).filter(
    (s) => s.id !== "__grapes_css__"
  );
  if (sections.length === 0) throwJson("Source document has no pages", 400);
  const limit = Math.min(sections.length, maxPages);

  const pages: PdfPage[] = [];
  for (let i = 0; i < limit; i++) {
    const shot = await takeDocumentScreenshot(ctx.user.id, source.documentId, i);
    if (shot.type !== "image") {
      throwJson(`Failed to screenshot source page ${i + 1}: ${shot.text}`, 500);
    }
    const buf = Buffer.from(shot.data, "base64");
    const dims = readImageDimensions(buf) || fallback;
    pages.push({ image: shot.data, width: dims.width, height: dims.height });
  }
  return { pages, sourceName: sourceDoc.name };
}

function buildClonePrompt(targetW: number, targetH: number): string {
  return `You are a world-class HTML/CSS developer. Reproduce the provided image as a single page in HTML + Tailwind CSS.

CANVAS: exactly ${targetW}×${targetH}px. Wrap output in:
<section class="relative w-[${targetW}px] h-[${targetH}px] overflow-hidden bg-white">…</section>

LAYOUT STRATEGY (hybrid):
1. Decorative shapes / blobs / accent backgrounds → position:absolute, low z (z-[0]–z-[5]), behind content.
2. Text content (headings, body, lists) → normal flow with flex/grid, position:relative z-[10]+. Reproduce EVERY word.
3. Overlapping photos → position:absolute, z-[15]–z-[20], placed to match the original.

TYPOGRAPHY:
- Big titles: text-5xl / text-6xl / text-7xl. Match visual weight.
- Section heads: text-2xl–text-4xl. Body: text-sm or text-base, leading-relaxed.
- Same language as the source.

COLORS: extract precise hex from the image. Use bg-[#hex] and text-[#hex].

IMAGES: <img data-image-query="english keywords" alt="desc" class="w-full h-full object-cover" />

OUTPUT: ONLY the <section>…</section>. No markdown fences, no explanations.`;
}

function buildReimaginePrompt(
  targetW: number,
  targetH: number,
  direction: ReturnType<typeof brandKitToDirection> | null,
  userInstruction?: string
): string {
  const colors = direction?.colors;
  const colorBlock = colors
    ? `BRAND COLORS — use these EXCLUSIVELY (via Tailwind semantic classes):
- Primary: ${colors.primary}      → bg-primary, text-primary
- Accent: ${colors.accent}        → bg-accent, text-accent
- Surface: ${colors.surface}      → bg-surface, text-on-surface
- Surface alt: ${colors.surfaceAlt} → bg-surface-alt
- Body text: ${colors.text}       → text-on-surface`
    : "BRAND COLORS — none provided. Use neutral palette (slate/gray) with one accent.";

  const fontBlock = direction?.headingFont || direction?.bodyFont
    ? `BRAND FONTS:
- Headings: ${direction?.headingFont || "system sans"} (use font-heading)
- Body: ${direction?.bodyFont || "system sans"} (use font-body)`
    : "";

  const moodBlock = direction?.mood ? `MOOD: ${direction.mood}` : "";
  const instructionBlock = userInstruction ? `\n\nADDITIONAL INSTRUCTION: ${userInstruction}` : "";

  return `You are a senior visual designer reimagining a page using a reference image as INSPIRATION.

The reference image shows the source layout (information hierarchy, visual rhythm, structure). Your job: produce a NEW design that keeps the same content & flow but applies the brand direction below. Do NOT copy colors, fonts, or decorations from the reference — replace them with the brand kit.

CANVAS: exactly ${targetW}×${targetH}px. Wrap output in:
<section class="relative w-[${targetW}px] h-[${targetH}px] overflow-hidden bg-surface">…</section>

${colorBlock}

${fontBlock}

${moodBlock}

CONTENT RULES:
- Reproduce every word of text from the reference (translate only if needed for consistency).
- Preserve the information hierarchy (which element is biggest, what reads first, etc.).
- Replace decorative elements with brand-appropriate shapes / accents.
- Use the brand color palette only — never hex from the source.

LAYOUT (hybrid): decorations position:absolute z-[0]–z-[5]; content normal flow z-[10]+; overlapping photos z-[15]+.

TYPOGRAPHY: text-5xl–text-7xl for titles, text-sm/base for body. leading-relaxed.

IMAGES: <img data-image-query="english keywords" alt="desc" class="w-full h-full object-cover" />
${instructionBlock}

OUTPUT: ONLY the <section>…</section>. No markdown, no explanations.`;
}

/**
 * Map an aspect ratio to the closest social preset. Returns null when nothing fits cleanly
 * (the caller falls back to letter for those — typical of portrait scans, screenshots, etc).
 */
function mapAspectToPreset(width: number, height: number): SocialPresetKey | null {
  if (!width || !height) return null;
  const r = width / height;
  if (r >= 1.6) return "slide-16-9";        // 16:9 deck
  if (r >= 1.27 && r <= 1.4) return "slide-16-9"; // 4:3-ish → upgrade to 16:9 deck
  if (r >= 0.95 && r <= 1.05) return "ig-square"; // 1:1
  if (r >= 0.78 && r <= 0.82) return "ig-feed";   // 4:5 portrait
  if (r >= 0.55 && r <= 0.6) return "ig-story";   // 9:16
  return null;
}

export async function cloneDocument(ctx: AuthContext, opts: CloneDocumentOpts) {
  requireScope(ctx, "WRITE");

  const mode: Mode = opts.mode || "clone";
  const maxPages = Math.min(opts.maxPages ?? 20, 30);

  // Resolve target format. When the agent doesn't pass `pageFormat`, auto-detect from the
  // source aspect ratio so PDFs / portrait screenshots / 1:1 IG posts don't get mangled
  // into 16:9 by an opinionated default.
  let formatInput: FormatInput | undefined;
  let autoDetectedNote = "";
  if (opts.pageFormat !== undefined) {
    formatInput =
      typeof opts.pageFormat === "string"
        ? { preset: opts.pageFormat as SocialPresetKey }
        : opts.pageFormat;
  } else if (opts.source.type === "document") {
    // Cheap DB read — source's own canvas wins.
    const srcDoc = await db.landing.findUnique({
      where: { id: opts.source.documentId },
      select: { metadata: true },
    });
    const meta = (srcDoc?.metadata as { format?: { width: number; height: number } } | null) ?? null;
    if (meta?.format?.width && meta?.format?.height) {
      formatInput = { width: meta.format.width, height: meta.format.height };
      autoDetectedNote = `source-doc ${meta.format.width}×${meta.format.height}`;
    }
  }

  // Tentative dims for resolveSource fallback. If formatInput is still unknown, use letter
  // so the source resolve doesn't itself depend on a format we haven't picked yet.
  const tentative = formatInput
    ? resolveFormat(formatInput).format ?? { width: 816, height: 1056 }
    : { width: 816, height: 1056 };

  // Resolve brand direction (reimagine only — clone ignores brand)
  let direction: ReturnType<typeof brandKitToDirection> | null = null;
  if (mode === "reimagine") {
    const kit = await resolveBrandKit(ctx.user.id, opts.brandKitId);
    if (kit) direction = brandKitToDirection(kit);
  }

  // Resolve source → page images (uses `tentative` as a fallback only when image dims fail to parse).
  const { pages, sourceName } = await resolveSource(ctx, opts.source, tentative, maxPages);

  // Auto-detect from the resolved first page when format is still unknown.
  if (!formatInput && pages.length > 0) {
    const firstW = pages[0].width;
    const firstH = pages[0].height;
    const preset = mapAspectToPreset(firstW, firstH);
    if (preset) {
      formatInput = { preset };
      autoDetectedNote = `${firstW}×${firstH} → ${preset}`;
    }
  }

  const { format, intent } = resolveFormat(formatInput);
  const targetDims = format || { width: 816, height: 1056 }; // letter fallback @ 96dpi
  const resolvedIntent = intent || detectIntent(targetDims);

  if (autoDetectedNote) {
    console.log(`[cloneDocument] auto-detected pageFormat: ${autoDetectedNote}`);
  }

  // Create the empty Landing v4 document up front so the agent gets an id back.
  const doc = await db.landing.create({
    data: {
      name: opts.name,
      prompt:
        mode === "clone"
          ? `Cloned from ${opts.source.type}: ${sourceName}`
          : `Reimagined from ${opts.source.type}: ${sourceName}`,
      sections: [] as any,
      theme: direction ? "custom" : "minimal",
      ...(direction
        ? {
            customColors: {
              bg: direction.colors.surface,
              accent: direction.colors.accent,
              text: direction.colors.text,
              primary: direction.colors.primary,
              surfaceAlt: direction.colors.surfaceAlt,
            } as any,
          }
        : {}),
      metadata: {
        ...(format ? { format } : {}),
        intent: resolvedIntent,
        cloneSource: opts.source.type,
        cloneMode: mode,
      } as any,
      version: 4,
      status: "DRAFT",
      ownerId: ctx.user.id,
    },
  });

  // Background generation — fire and forget.
  generatePagesInBackground(ctx, doc.id, pages, {
    mode,
    targetW: targetDims.width,
    targetH: targetDims.height,
    direction,
    instruction: opts.instruction,
  }).catch((err) => {
    console.error(`[cloneDocument] background generation failed for ${doc.id}:`, err);
  });

  return {
    documentId: doc.id,
    totalPages: pages.length,
    pageFormat: targetDims,
    intent: resolvedIntent,
    mode,
    status: "generating",
    message: `Generating ${pages.length} page(s). Poll get_document for progress.`,
  };
}

async function generatePagesInBackground(
  ctx: AuthContext,
  documentId: string,
  pages: PdfPage[],
  opts: {
    mode: Mode;
    targetW: number;
    targetH: number;
    direction: ReturnType<typeof brandKitToDirection> | null;
    instruction?: string;
  }
) {
  const sections: any[] = [];
  const systemPrompt =
    opts.mode === "clone"
      ? buildClonePrompt(opts.targetW, opts.targetH)
      : buildReimaginePrompt(opts.targetW, opts.targetH, opts.direction, opts.instruction);

  for (let i = 0; i < pages.length; i++) {
    try {
      const html = await generateSinglePage(pages[i], systemPrompt, opts.targetW, opts.targetH);
      sections.push({ id: nanoid(8), order: i, html, type: "section", name: `Page ${i + 1}` });
      await db.landing.update({ where: { id: documentId }, data: { sections: sections as any } });
    } catch (err: any) {
      console.error(`[cloneDocument] page ${i} failed:`, err.message);
      sections.push({
        id: nanoid(8),
        order: i,
        type: "section",
        name: `Page ${i + 1}`,
        html: `<section class="relative w-[${opts.targetW}px] h-[${opts.targetH}px] flex items-center justify-center bg-white"><div class="text-center"><h2 class="text-3xl font-bold">Page ${i + 1}</h2><p class="text-red-600 mt-2">Generation failed</p></div></section>`,
      });
      await db.landing.update({ where: { id: documentId }, data: { sections: sections as any } });
    }
  }
}

async function generateSinglePage(
  page: PdfPage,
  systemPrompt: string,
  targetW: number,
  targetH: number
): Promise<string> {
  const buf = Buffer.from(page.image, "base64");
  const result = streamText({
    model: getModel(),
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", image: buf },
          {
            type: "text",
            text: `Source page is ${page.width}×${page.height}px. Generate the output for the ${targetW}×${targetH}px target canvas.`,
          },
        ],
      },
    ],
  });

  let html = cleanHtmlResponse(await result.text);
  html = await enrichImages(html).catch(() => html);
  return html;
}
