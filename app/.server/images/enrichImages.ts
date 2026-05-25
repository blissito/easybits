import {
  enrichImages as _enrichImages,
  findImageSlots,
  searchImage,
} from "@easybits.cloud/html-tailwind-generator/images";

export { findImageSlots };

/**
 * Enrich all images in an HTML string with Pexels photos.
 * Uses PEXELS_API_KEY env var.
 */
export async function enrichImages(html: string): Promise<string> {
  return _enrichImages(html, process.env.PEXELS_API_KEY);
}

/**
 * Resolve ONLY <img data-image-query="..."> placeholders to real Pexels photos.
 * Any <img src="..."> the agent already provided is left untouched — including
 * "fake" domains (unsplash/pixabay/etc) that full enrichImages would rewrite.
 * We never second-guess an image the LLM sent on purpose.
 */
export async function enrichImageQueriesOnly(html: string): Promise<string> {
  if (!html || !html.includes("data-image-query")) return html;
  const pexelsApiKey = process.env.PEXELS_API_KEY;
  if (!pexelsApiKey) return html;

  const slots = findImageSlots(html).filter((s) =>
    s.searchStr.includes("data-image-query")
  );
  if (slots.length === 0) return html;

  const resolved = await Promise.allSettled(
    slots.map(async (slot) => {
      const img = await searchImage(slot.query, pexelsApiKey).catch(() => null);
      return { slot, url: img?.url || null };
    })
  );

  let result = html;
  for (const r of resolved) {
    if (r.status === "fulfilled" && r.value.url) {
      const { slot, url } = r.value;
      result = result.replaceAll(slot.searchStr, slot.replaceStr.replace("{url}", url));
    }
  }
  return result;
}
