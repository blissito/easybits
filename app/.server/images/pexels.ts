const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

interface PexelsResult {
  url: string;
  photographer: string;
  alt: string;
}

export async function searchImage(query: string): Promise<PexelsResult | null> {
  if (!PEXELS_API_KEY) return null;
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data.photos?.[0];
    if (!photo) return null;
    return {
      url: photo.src.medium,
      photographer: photo.photographer,
      alt: photo.alt || query,
    };
  } catch {
    return null;
  }
}
