/**
 * EXPERIMENTAL — PDF clone/inspire for presentations.
 * Quality is not production-grade yet. Best results with Gemini Pro + hybrid prompt.
 * Next: test with Claude Sonnet, SSIM scoring, section-by-section cloning.
 * See memory/project_pdf_clone.md for findings.
 */
import { nanoid } from "nanoid";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { getReadClientForPlatformFile, getClientForFile } from "../storage";
import { streamText } from "ai";
import { resolveModelLocal } from "../aiModels";
import { pdfToImages } from "./pdfToImages";
import type { PdfPage } from "./pdfToImages";
import { savePresentationStyle } from "./presentationStyles";
import { CLONE_CORRECTION_PROMPT, CLONE_SCORE_PROMPT, INSPIRE_SLIDE_PROMPT } from "~/lib/presentationPrompts";
import { enrichImages } from "../images/enrichImages";

const CLONE_MODEL = "gemini-2.5-pro";

/**
 * Hybrid clone prompt: absolute positioning for decorations, normal flow for content.
 * This approach produces the best z-index handling and text readability.
 */
const CLONE_HYBRID_PROMPT = `You are a world-class HTML/CSS developer. Reproduce this PDF page as faithfully as possible using HTML + Tailwind CSS.

STRATEGY — HYBRID layout:
1. Root container: position:relative, exact page dimensions, overflow:hidden, white background
2. DECORATIVE LAYERS (background shapes, blobs, accent areas): position:absolute, z-[0] to z-[5]. These go BEHIND everything.
3. CONTENT (text columns, headings, body text): normal document flow using flexbox/grid, with position:relative z-[10]. Text flows naturally this way.
4. OVERLAPPING PHOTOS: position:absolute with z-[15-20], sized and placed to match the original.

TYPOGRAPHY — CRITICAL, get this right:
- Headlines: LARGE. Use text-5xl, text-6xl, text-7xl, text-8xl for big titles. Match the visual weight.
- Section titles: text-2xl to text-4xl
- Body text: text-sm or text-base, NEVER smaller. Leading-relaxed for readability.
- Bold text: font-bold or font-semibold
- Reproduce EVERY word. Do not summarize or skip text.
- Same language as original.

COLORS — use exact hex values:
- bg-[#hex], text-[#hex] — extract precise colors from the image

IMAGES:
- <img data-image-query="descriptive english keywords" alt="desc" class="w-full h-full object-cover" />
- People photos: describe specifically ("professional woman in gray blazer holding pen")

DECORATIVE SHAPES:
- Organic blobs: large divs with rounded-full or rounded-[40%_60%_50%_70%], correct color, position:absolute
- Must be BEHIND content (low z-index)

Output ONLY the inner HTML content. No <html>, <head>, <body> wrappers. No markdown fences. No explanations.`;

function throwJson(error: string, status: number): never {
  throw new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getModel(modelId?: string) {
  return resolveModelLocal(modelId || CLONE_MODEL);
}

interface CloneOpts {
  fileId: string;
  mode: "clone" | "inspire";
  name: string;
  content?: string;
  styleId?: string;
  maxPages?: number;
  model?: string;
}

/**
 * EXPERIMENTAL: Clone or get inspired by a PDF to create a presentation.
 * Creates the presentation immediately, then generates slides in background.
 */
export async function clonePresentationFromPdf(ctx: AuthContext, opts: CloneOpts) {
  requireScope(ctx, "WRITE");

  const { fileId, mode, name, content, styleId, maxPages = 20, model } = opts;

  // 1. Fetch PDF from EasyBits storage
  const file = await db.file.findUnique({ where: { id: fileId } });
  if (!file || file.ownerId !== ctx.user.id) throwJson("File not found", 404);
  if (!file.contentType?.includes("pdf")) throwJson("File must be a PDF", 400);

  const client = file.storageProviderId
    ? await getClientForFile(file.storageProviderId, ctx.user.id)
    : getReadClientForPlatformFile(file);
  const readUrl = await client.getReadUrl(file.storageKey);
  const pdfResponse = await fetch(readUrl);
  if (!pdfResponse.ok) throwJson("Failed to read PDF file", 500);
  const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

  // 2. Convert PDF to images (native dimensions)
  const pages = await pdfToImages(pdfBuffer, { maxPages });

  if (pages.length === 0) throwJson("PDF has no pages", 400);

  // 3. Create empty presentation
  const presentation = await db.presentation.create({
    data: {
      name,
      prompt: mode === "clone" ? `Cloned from PDF: ${file.name}` : (content || `Inspired by: ${file.name}`),
      slides: [] as any,
      theme: "black",
      status: "DRAFT",
      ownerId: ctx.user.id,
    },
  });

  // 4. Launch background generation (fire-and-forget)
  generateSlidesInBackground(ctx, presentation.id, pages, {
    mode,
    content,
    styleId,
    sourceFileId: fileId,
    fileName: file.name,
    model,
  }).catch((err) => {
    console.error(`[clonePresentation] background generation failed for ${presentation.id}:`, err);
  });

  return {
    presentationId: presentation.id,
    totalPages: pages.length,
    pageDimensions: { width: pages[0].width, height: pages[0].height },
    status: "generating",
    message: `Converting ${pages.length} pages. Poll with get_presentation to see progress.`,
  };
}

async function generateSlidesInBackground(
  ctx: AuthContext,
  presentationId: string,
  pages: PdfPage[],
  opts: { mode: "clone" | "inspire"; content?: string; styleId?: string; sourceFileId: string; fileName: string; model?: string }
) {
  const pageImages = pages.map((p) => p.image);
  let designSystem: any = null;

  // For inspire mode, extract or load design system first
  if (opts.mode === "inspire") {
    if (opts.styleId) {
      const style = await db.presentationStyle.findUnique({ where: { id: opts.styleId } });
      if (style && style.ownerId === ctx.user.id) {
        designSystem = style.designSystem;
      }
    }
    if (!designSystem) {
      const savedStyle = await savePresentationStyle(ctx, {
        name: `Style from ${opts.fileName}`,
        pageImages,
        sourceFileId: opts.sourceFileId,
      });
      designSystem = savedStyle.designSystem;

      if (designSystem?.colors) {
        await db.presentation.update({
          where: { id: presentationId },
          data: { customColors: designSystem.colors as any },
        });
      }
    }
  }

  // Generate slides one by one
  const slides: any[] = [];

  for (let i = 0; i < pages.length; i++) {
    try {
      const { width: pw, height: ph } = pages[i];
      const html = opts.mode === "clone"
        ? await cloneSingleSlide(pageImages[i], pw, ph, 3, opts.model)
        : await inspireSingleSlide(designSystem, opts.content || "", i, pages.length, opts.model);

      slides.push({ id: nanoid(8), order: i, type: "2d", html, width: pw, height: ph });

      await db.presentation.update({
        where: { id: presentationId },
        data: { slides: slides as any },
      });
    } catch (err: any) {
      console.error(`[clonePresentation] slide ${i} failed:`, err.message);
      slides.push({
        id: nanoid(8),
        order: i,
        type: "2d",
        html: `<div class="centered"><h2>Slide ${i + 1}</h2><p>Generation failed</p></div>`,
      });
      await db.presentation.update({
        where: { id: presentationId },
        data: { slides: slides as any },
      });
    }
  }
}

async function cloneSingleSlide(pageImage: string, pageWidth: number, pageHeight: number, maxIterations = 3, modelId?: string): Promise<string> {
  const originalBuf = Buffer.from(pageImage, "base64");
  const model = getModel(modelId);

  // 1. First generation using hybrid prompt
  const result = streamText({
    model,
    system: CLONE_HYBRID_PROMPT,
    messages: [{
      role: "user",
      content: [
        { type: "image", image: originalBuf },
        { type: "text", text: `Reproduce this page exactly. Dimensions: ${pageWidth}×${pageHeight}px.` },
      ],
    }],
  });

  let html = cleanHtmlResponse(await result.text);
  html = await enrichImages(html).catch(() => html);

  // Score initial attempt
  let renderedBuf = await screenshotHtml(html, pageWidth, pageHeight);
  if (!renderedBuf) return html;

  let bestHtml = html;
  let bestScore = await scoreReproduction(originalBuf, renderedBuf);
  console.log(`[clone] iter 0: score=${bestScore}`);

  // 2. Correction loop with anti-regression
  for (let iter = 0; iter < maxIterations - 1; iter++) {
    const correction = streamText({
      model,
      system: CLONE_CORRECTION_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "image", image: originalBuf },
          { type: "image", image: renderedBuf },
          { type: "text", text: `Current HTML code:\n\`\`\`html\n${html}\n\`\`\`\n\nFirst image is the ORIGINAL. Second is the current reproduction. Edit the HTML to fix differences, or respond LGTM if ≥80% faithful.` },
        ],
      }],
    });

    const response = (await correction.text).trim();
    if (response === "LGTM" || response.startsWith("LGTM")) {
      console.log(`[clone] iter ${iter + 1}: LGTM`);
      break;
    }

    const correctedHtml = cleanHtmlResponse(response);
    const enrichedHtml = await enrichImages(correctedHtml).catch(() => correctedHtml);
    const correctedBuf = await screenshotHtml(enrichedHtml, pageWidth, pageHeight);
    if (!correctedBuf) break;

    const newScore = await scoreReproduction(originalBuf, correctedBuf);
    console.log(`[clone] iter ${iter + 1}: score=${newScore} (prev=${bestScore})`);

    if (newScore < bestScore) {
      console.log(`[clone] iter ${iter + 1}: REGRESSION detected, rolling back`);
      html = bestHtml;
      break;
    }

    bestHtml = enrichedHtml;
    bestScore = newScore;
    html = enrichedHtml;
    renderedBuf = correctedBuf;
  }

  return html;
}

/** Score how faithful a reproduction is (1-10) using Flash vision */
async function scoreReproduction(originalBuf: Buffer, renderedBuf: Buffer): Promise<number> {
  try {
    const model = getModel("gemini-2.5-flash"); // scoring always on Flash (cheap)
    const result = streamText({
      model,
      system: CLONE_SCORE_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "image", image: originalBuf },
          { type: "image", image: renderedBuf },
          { type: "text", text: "Rate the reproduction fidelity 1-10." },
        ],
      }],
    });
    const score = parseInt((await result.text).trim(), 10);
    return isNaN(score) ? 5 : Math.min(10, Math.max(1, score));
  } catch {
    return 5;
  }
}

// Browser singleton for screenshots
let screenshotBrowserPromise: ReturnType<typeof launchScreenshotBrowser> | null = null;

async function launchScreenshotBrowser() {
  const { chromium } = await import("playwright-core");
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

function getScreenshotBrowser() {
  if (!screenshotBrowserPromise) screenshotBrowserPromise = launchScreenshotBrowser();
  return screenshotBrowserPromise;
}

/** Screenshot an HTML page at given dimensions using a reusable browser */
async function screenshotHtml(slideHtml: string, width = 960, height = 540): Promise<Buffer | null> {
  const fullHtml = `<!DOCTYPE html><html><head>
<script src="https://cdn.tailwindcss.com"></script>
<style>body{margin:0;}</style>
</head><body><div style="width:${width}px;height:${height}px;position:relative;overflow:hidden;">${slideHtml}</div></body></html>`;

  try {
    const browser = await getScreenshotBrowser();
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await page.setContent(fullHtml, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(2000);
      return await page.screenshot({ type: "png" });
    } finally {
      await page.close();
    }
  } catch (err: any) {
    screenshotBrowserPromise = null;
    console.error("[screenshotHtml] failed:", err.message);
    return null;
  }
}

async function inspireSingleSlide(
  designSystem: any,
  content: string,
  slideIndex: number,
  totalSlides: number,
  modelId?: string,
): Promise<string> {
  const slidePosition = slideIndex === 0 ? "title/opening" :
    slideIndex === totalSlides - 1 ? "closing/CTA" : `content (slide ${slideIndex + 1} of ${totalSlides})`;

  const result = streamText({
    model: getModel(modelId),
    system: INSPIRE_SLIDE_PROMPT,
    messages: [{
      role: "user",
      content: `Design system to follow:\n${JSON.stringify(designSystem, null, 2)}\n\nSlide position: ${slidePosition}\nTopic/content: ${content}\n\nGenerate the HTML for this slide.`,
    }],
  });

  const html = cleanHtmlResponse(await result.text);
  return enrichImages(html).catch(() => html);
}

function cleanHtmlResponse(text: string): string {
  let html = text.trim();
  if (html.startsWith("```")) {
    html = html.replace(/^```(?:html)?\n?/, "").replace(/\n?```$/, "");
  }
  return html.trim();
}
