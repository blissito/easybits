/**
 * Generate a 1200×630 og:image for a generic Website served at /s/<slug>/.
 *
 * Unlike takeOgScreenshot which assumes a landing v4 document with known
 * sections, this one doesn't care what the HTML is — it just navigates a
 * headless browser to the live URL and screenshots the top fold.
 *
 * Result is uploaded to Tigris public bucket and the URL is cached on
 * Website.metadata.ogImageUrl so subsequent requests read it in O(1) without
 * hitting Playwright or Tigris.
 */
import { db } from "../db";
import { getPlatformDefaultClient, PUBLIC_BUCKET } from "../storage";
import { withPage } from "./browserPool";
import { nanoid } from "nanoid";

const BASE_URL = process.env.PUBLIC_BASE_URL || "https://www.easybits.cloud";

export async function generateWebsiteOg(websiteId: string): Promise<string | null> {
  const website = await db.website.findUnique({ where: { id: websiteId } });
  if (!website) return null;

  const pageUrl = `${BASE_URL}/s/${website.slug}?__og=1`;

  let buf: Buffer;
  try {
    buf = await withPage(
      async (page) => {
        await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 20000 }).catch(async () => {
          await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
        });
        // Small delay so lazy-loaded images/fonts settle before capture.
        await page.waitForTimeout(600).catch(() => {});
        return page.screenshot({
          type: "png",
          clip: { x: 0, y: 0, width: 1200, height: 630 },
        });
      },
      { viewport: { width: 1200, height: 630 } }
    );
  } catch (err: any) {
    console.error("[websiteOg] screenshot failed:", err?.message);
    return null;
  }

  const storageKey = `og/${websiteId}-${nanoid(4)}.png`;
  try {
    const client = getPlatformDefaultClient({ bucket: PUBLIC_BUCKET });
    const putUrl = await client.getPutUrl(storageKey);
    const uploadRes = await fetch(putUrl, {
      method: "PUT",
      body: new Uint8Array(buf),
      headers: { "Content-Type": "image/png" },
    });
    if (!uploadRes.ok) {
      console.error("[websiteOg] upload failed:", uploadRes.status);
      return null;
    }
    const imageUrl = `https://${PUBLIC_BUCKET}.fly.storage.tigris.dev/${storageKey}`;

    // Persist on Website.metadata so the loader doesn't regenerate next time.
    const meta = (website.metadata as Record<string, unknown>) || {};
    await db.website.update({
      where: { id: websiteId },
      data: { metadata: { ...meta, ogImageUrl: imageUrl, ogGeneratedAt: new Date().toISOString() } as any },
    });

    return imageUrl;
  } catch (err: any) {
    console.error("[websiteOg] persist failed:", err?.message);
    return null;
  }
}
