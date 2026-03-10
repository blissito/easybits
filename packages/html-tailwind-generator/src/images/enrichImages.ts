import { searchImage } from "./pexels";
import { generateImage } from "./dalleImages";

interface ImageMatch {
  query: string;
  searchStr: string;
  replaceStr: string;
}

export interface EnrichImagesOptions {
  pexelsApiKey?: string;
  openaiApiKey?: string;
  /** Called with temp URL + query, returns permanent URL. Use to persist DALL-E images to S3/etc. */
  persistImage?: (tempUrl: string, query: string) => Promise<string>;
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

  // 1. data-image-query="..." — match the full <img> tag so we can replace src + data-image-query together
  const diqRegex = /<img\s[^>]*data-image-query="([^"]+)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = diqRegex.exec(html)) !== null) {
    const fullTag = m[0];
    const query = m[1];
    if (seen.has(query)) continue;
    seen.add(query);
    // Build replacement tag: replace src (if any) and data-image-query with final src
    const cleanedTag = fullTag
      .replace(/\ssrc="[^"]*"/, "")
      .replace(/\sdata-image-query="[^"]*"/, "");
    // Insert src and data-enriched right after <img
    const replaceTag = cleanedTag.replace(
      /^<img/,
      `<img src="{url}" data-enriched="true"`
    );
    matches.push({
      query,
      searchStr: fullTag,
      replaceStr: replaceTag,
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
 * Enrich all images in an HTML string.
 * Strategy: Pexels (free) → DALL-E fallback (if openaiApiKey) → placeholder.
 * All images resolved in parallel. If persistImage callback provided, temp DALL-E URLs are persisted.
 */
export async function enrichImages(html: string, pexelsApiKeyOrOpts?: string | EnrichImagesOptions, openaiApiKey?: string): Promise<string> {
  // Support both legacy (string, string) and new (options object) signatures
  let opts: EnrichImagesOptions;
  if (typeof pexelsApiKeyOrOpts === "object" && pexelsApiKeyOrOpts !== null) {
    opts = pexelsApiKeyOrOpts;
  } else {
    opts = { pexelsApiKey: pexelsApiKeyOrOpts, openaiApiKey };
  }

  const slots = findImageSlots(html);
  if (slots.length === 0) return html;

  // Resolve all images in parallel
  const resolved = await Promise.allSettled(
    slots.map(async (slot) => {
      let url: string | null = null;

      // 1. Pexels first (free)
      if (opts.pexelsApiKey) {
        const img = await searchImage(slot.query, opts.pexelsApiKey).catch(() => null);
        url = img?.url || null;
      }

      // 2. DALL-E fallback if Pexels found nothing
      if (!url && opts.openaiApiKey) {
        try {
          const tempUrl = await generateImage(slot.query, opts.openaiApiKey);
          url = opts.persistImage
            ? await opts.persistImage(tempUrl, slot.query)
            : tempUrl;
        } catch (e) {
          console.warn(`[dalle] failed for "${slot.query}":`, e);
        }
      }

      // 3. Placeholder fallback
      url ??= `https://placehold.co/800x500/1f2937/9ca3af?text=${encodeURIComponent(slot.query.slice(0, 30))}`;

      return { slot, url };
    })
  );

  let result = html;
  for (const r of resolved) {
    if (r.status === "fulfilled" && r.value) {
      const { slot, url } = r.value;
      const replacement = slot.replaceStr.replace("{url}", url);
      result = result.replaceAll(slot.searchStr, replacement);
    }
  }

  // Catch any remaining <img> tags without src
  result = result.replace(/<img\s(?![^>]*\bsrc=)([^>]*?)>/gi, (_match, attrs) => {
    const altMatch = attrs.match(/alt="([^"]*?)"/);
    const query = altMatch?.[1] || "professional image";
    return `<img src="https://placehold.co/800x500/1f2937/9ca3af?text=${encodeURIComponent(query.slice(0, 30))}" ${attrs}>`;
  });

  return result;
}
