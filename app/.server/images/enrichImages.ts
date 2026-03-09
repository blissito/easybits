import {
  enrichImages as _enrichImages,
  findImageSlots,
} from "@easybits.cloud/html-tailwind-generator/images";

export { findImageSlots };

/**
 * Enrich all images in an HTML string with Pexels photos.
 * Uses PEXELS_API_KEY env var.
 */
export async function enrichImages(html: string): Promise<string> {
  return _enrichImages(html, process.env.PEXELS_API_KEY);
}
