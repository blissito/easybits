import { searchImage } from "./pexels";
import { generateImage } from "./dalleImages";

interface ImageMatch {
  query: string;
  searchStr: string;
  replaceStr: string;
}

const FAKE_DOMAINS = [
  "images.unsplash.com",
  "unsplash.com",
  "via.placeholder.com",
  "placeholder.com",
  "placehold.co",
  "placehold.it",
  "placekitten.com",
  "picsum.photos",
  "loremflickr.com",
  "source.unsplash.com",
  "dummyimage.com",
  "fakeimg.pl",
  "example.com",
  "img.freepik.com",
  "cdn.pixabay.com",
];

/**
 * Find all images in HTML that need Pexels enrichment.
 * Two strategies:
 * 1. data-image-query="..." — AI followed instructions
 * 2. <img src="fake-url" — detect fake domains, use alt/class/nearby text as query
 */
export function findImageSlots(html: string): ImageMatch[] {
  const matches: ImageMatch[] = [];
  const seen = new Set<string>();

  // 1. data-image-query="..."
  const diqRegex = /data-image-query="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = diqRegex.exec(html)) !== null) {
    const query = m[1];
    if (seen.has(query)) continue;
    seen.add(query);
    matches.push({
      query,
      searchStr: `data-image-query="${query}"`,
      replaceStr: `src="{url}" data-enriched="true"`,
    });
  }

  // 2. <img with fake/non-existent src URLs
  const imgRegex = /<img\s[^>]*src="(https?:\/\/[^"]+)"[^>]*>/gi;
  while ((m = imgRegex.exec(html)) !== null) {
    const fullTag = m[0];
    const srcUrl = m[1];

    if (fullTag.includes("data-enriched")) continue;
    if (srcUrl.includes("pexels.com")) continue;
    if (seen.has(srcUrl)) continue;

    // Check if domain is fake
    let isFake = false;
    try {
      const domain = new URL(srcUrl).hostname;
      isFake = FAKE_DOMAINS.some((d) => domain.includes(d));
    } catch {
      isFake = true;
    }
    if (!isFake) continue;

    // Extract query: try alt, then class context, then URL path words
    const altMatch = fullTag.match(/alt="([^"]*?)"/);
    let query = altMatch?.[1]?.trim() || "";

    if (!query) {
      // Try to extract meaningful words from the URL path
      try {
        const path = new URL(srcUrl).pathname;
        const words = path
          .replace(/[^a-zA-Z]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 2)
          .slice(0, 4)
          .join(" ");
        if (words.length > 3) query = words;
      } catch { /* ignore */ }
    }

    if (!query) query = "professional website hero image";

    seen.add(srcUrl);
    matches.push({
      query,
      searchStr: `src="${srcUrl}"`,
      replaceStr: `src="{url}" data-enriched="true"`,
    });
  }

  return matches;
}

/**
 * Enrich all images in an HTML string with Pexels photos.
 */
export async function enrichImages(html: string, pexelsApiKey?: string, openaiApiKey?: string): Promise<string> {
  const slots = findImageSlots(html);
  if (slots.length === 0) return html;

  let result = html;
  const promises = slots.map(async (slot) => {
    let url: string | null = null;
    if (openaiApiKey) {
      url = await generateImage(slot.query, openaiApiKey).catch(() => null);
    }
    if (!url) {
      const img = await searchImage(slot.query, pexelsApiKey).catch(() => null);
      url = img?.url || null;
    }
    url ??= `https://placehold.co/800x500/1f2937/9ca3af?text=${encodeURIComponent(slot.query.slice(0, 30))}`;
    const replacement = slot.replaceStr.replace("{url}", url);
    result = result.replaceAll(slot.searchStr, replacement);
  });

  await Promise.allSettled(promises);

  // Catch any remaining <img> tags without src (AI didn't follow instructions)
  result = result.replace(/<img\s(?![^>]*\bsrc=)([^>]*?)>/gi, (_match, attrs) => {
    const altMatch = attrs.match(/alt="([^"]*?)"/);
    const query = altMatch?.[1] || "professional image";
    return `<img src="https://placehold.co/800x500/1f2937/9ca3af?text=${encodeURIComponent(query.slice(0, 30))}" ${attrs}>`;
  });

  return result;
}
