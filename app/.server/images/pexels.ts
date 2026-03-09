import { searchImage as _searchImage, type PexelsResult } from "@easybits.cloud/html-tailwind-generator/images";

export type { PexelsResult };

/**
 * Search for an image on Pexels. Uses PEXELS_API_KEY env var.
 */
export async function searchImage(query: string): Promise<PexelsResult | null> {
  return _searchImage(query, process.env.PEXELS_API_KEY);
}
