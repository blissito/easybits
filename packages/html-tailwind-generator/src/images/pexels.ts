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
      console.warn(`[pexels] ${res.status} for "${query}", trying unsplash fallback`);
      return searchUnsplash(query);
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
    return searchUnsplash(query);
  }
}

async function searchUnsplash(query: string): Promise<PexelsResult | null> {
  try {
    const res = await fetch(
      `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.results;
    if (!results || results.length === 0) return null;
    const photo = results[Math.floor(Math.random() * results.length)];
    return {
      url: photo.urls?.regular || photo.urls?.small,
      photographer: photo.user?.name || "Unsplash",
      alt: photo.alt_description || query,
    };
  } catch {
    return null;
  }
}
