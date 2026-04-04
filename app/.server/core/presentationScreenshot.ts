import { db } from "../db";
import type { Slide } from "~/lib/buildRevealHtml";
import { withPage } from "./browserPool";
import { buildSingleThemeCss, buildCustomTheme } from "@easybits.cloud/html-tailwind-generator";
import { replaceCdnWithCompiledCSS } from "../tailwind";

export async function takeSlideScreenshot(
  userId: string,
  presentationId: string,
  slideIndex = 0
): Promise<{ type: "image"; mimeType: "image/png"; data: string } | { type: "text"; text: string }> {
  if (!/^[0-9a-fA-F]{24}$/.test(presentationId)) {
    return { type: "text", text: "Presentation not found" };
  }

  const pres = await db.presentation.findUnique({ where: { id: presentationId } });
  if (!pres || pres.ownerId !== userId) {
    return { type: "text", text: "Presentation not found" };
  }

  const slides = (pres.slides as unknown as Slide[]) || [];
  if (slides.length === 0) {
    return { type: "text", text: "Presentation has no slides" };
  }

  if (slideIndex < 0 || slideIndex >= slides.length) {
    return { type: "text", text: `Invalid slideIndex: ${slideIndex}. Presentation has ${slides.length} slide(s) (0-${slides.length - 1}).` };
  }

  const slide = slides[slideIndex];
  const { buildPresentationHtml } = await import("~/lib/presentation/buildHtml");
  const section = { id: slide.id, order: 0, html: slide.html || "<section></section>" } as any;
  const html = buildPresentationHtml([section], {
    title: pres.name,
    themeName: "minimal",
    customColors: (pres.customColors as Record<string, string>) || undefined,
  });

  try {
    return await withPage(async (page) => {
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.fonts.ready.then(() => true), { timeout: 5000 }).catch(() => {});
      const buffer = await page.screenshot({ type: "png" });
      return { type: "image" as const, mimeType: "image/png" as const, data: buffer.toString("base64") };
    }, { viewport: { width: 960, height: 540 } });
  } catch (err: any) {
    return {
      type: "text" as const,
      text: `Screenshot unavailable: ${err.message}. This tool requires Chrome installed locally.`,
    };
  }
}

/** Generate a PDF of the entire presentation (one slide per page, landscape). Returns Buffer or null. */
export async function takePresentationPdf(
  userId: string,
  presentationId: string
): Promise<Buffer | null> {
  if (!/^[0-9a-fA-F]{24}$/.test(presentationId)) return null;

  const pres = await db.presentation.findUnique({ where: { id: presentationId } });
  if (!pres || pres.ownerId !== userId) return null;

  const slides = (pres.slides as unknown as Slide[]) || [];
  if (slides.length === 0) return null;

  const customColors = (pres.customColors as Record<string, string>) || undefined;
  let themeCss: string | undefined;
  let tailwindConfig: string | undefined;

  if (customColors) {
    const t = buildCustomTheme(customColors as any);
    themeCss = `:root {\n${Object.entries(t.colors).map(([k, v]) => `  --color-${k}: ${v};`).join("\n")}\n}`;
    tailwindConfig = buildSingleThemeCss("minimal").tailwindConfig;
  } else {
    const themeId = "minimal";
    const tc = buildSingleThemeCss(themeId);
    themeCss = tc.css;
    tailwindConfig = tc.tailwindConfig;
  }

  // Build print HTML: one 960×540 slide per page
  const slidesHtml = slides
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const inner = s.html || "";
      return `<div class="slide-page"><section class="w-[960px] h-[540px] relative overflow-hidden">${inner}</section></div>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"><\/script>
  ${tailwindConfig ? `<script>tailwind.config = ${tailwindConfig}<\/script>` : ""}
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page { size: 960px 540px; margin: 0; }
    ${themeCss || ""}
    body { font-family: 'Inter', sans-serif; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .slide-page { width: 960px; height: 540px; overflow: hidden; page-break-after: always; break-after: page; }
    .slide-page:last-child { page-break-after: auto; break-after: auto; }
  </style>
</head>
<body>
${slidesHtml}
</body>
</html>`;

  const optimizedHtml = await replaceCdnWithCompiledCSS(html);

  try {
    return await withPage(async (page) => {
      await page.setContent(optimizedHtml, { waitUntil: "networkidle" });
      return await page.pdf({ width: "960px", height: "540px", printBackground: true, landscape: false });
    });
  } catch (err: any) {
    console.error("[takePresentationPdf] error:", err.message);
    return null;
  }
}
