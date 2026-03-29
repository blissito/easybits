import { db } from "../db";
import type { Slide } from "~/lib/buildRevealHtml";
import { withPage } from "./browserPool";

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
