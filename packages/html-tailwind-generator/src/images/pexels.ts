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
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape&locale=en-US`,
      { headers: { Authorization: key } }
    );
    if (!res.ok) {
      console.warn(`[pexels] ${res.status} for "${query}"`);
      return null;
    }
    const data = await res.json();
    const photos = data.photos;
    if (!photos || photos.length === 0) {
      console.warn(`[pexels] 0 results for "${query}"`);
      return null;
    }
    const photo = photos[Math.floor(Math.random() * photos.length)];
    return {
      url: photo.src.large,
      photographer: photo.photographer,
      alt: photo.alt || query,
    };
  } catch {
    return null;
  }
}
