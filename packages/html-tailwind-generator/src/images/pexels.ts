export interface PexelsResult {
  url: string;
  photographer: string;
  alt: string;
}

export async function searchImage(query: string, apiKey?: string): Promise<PexelsResult | null> {
  const key = apiKey || process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape&locale=en-US`,
      { headers: { Authorization: key } }
    );
    if (!res.ok) {
      console.warn(`[pexels] ${res.status} for "${query}"`);
      return null;
    }
    const data = await res.json();
    const photo = data.photos?.[0];
    if (!photo) {
      console.warn(`[pexels] 0 results for "${query}"`);
      return null;
    }
    return {
      url: photo.src.large,
      photographer: photo.photographer,
      alt: photo.alt || query,
    };
  } catch {
    return null;
  }
}
