/**
 * Búsqueda de fotos de stock, con varios bancos gratuitos encadenados.
 *
 * ORDEN: Pexels → Unsplash (oficial) → Pixabay → Openverse → Unsplash (napi).
 *
 * Cada proveedor se activa solo si tiene su llave; **Openverse no pide ninguna**,
 * así que la cadena nunca se queda sin fondo aunque no haya ni una configurada.
 *
 * ⚠️ El último eslabón, `unsplash.com/napi/...`, es la API **interna** del sitio
 * de Unsplash: sin contrato, sin llave y fuera de sus términos. Era el único
 * fallback que existía y se conserva para no degradar lo que hoy funciona, pero
 * está deliberadamente al final: en cuanto haya `unsplashAccessKey` la cadena no
 * llega ahí. Puede romperse cualquier día sin aviso.
 */

export interface StockPhoto {
  url: string;
  photographer: string;
  alt: string;
  /** Qué banco la sirvió. Útil para depurar y para atribuir. */
  provider: "pexels" | "unsplash" | "pixabay" | "openverse" | "unsplash-napi";
  /** Página de la foto, para atribuir con enlace. */
  sourceUrl?: string;
  /**
   * Sólo Unsplash oficial: endpoint que HAY QUE llamar cuando la foto se usa de
   * verdad. No descarga nada — es cómo Unsplash le acredita la vista al autor, y
   * omitirlo incumple sus términos aunque todo siga funcionando.
   */
  downloadLocation?: string;
}

export interface StockPhotoKeys {
  pexelsApiKey?: string;
  unsplashAccessKey?: string;
  pixabayApiKey?: string;
}

const TIMEOUT_MS = 6000;

async function getJson(url: string, headers?: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/** Elige una de las primeras N para que dos secciones con la misma consulta no
 *  salgan con la misma foto. */
const pick = (arr: any[]): any => arr[Math.floor(Math.random() * arr.length)];

// ==================== PROVEEDORES ====================

async function fromPexels(q: string, key: string): Promise<StockPhoto | null> {
  const data = await getJson(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=5&orientation=landscape&locale=en-US`,
    { Authorization: key }
  );
  const photos = data?.photos;
  if (!photos?.length) return null;
  const p = pick(photos);
  return {
    url: p.src.large,
    photographer: p.photographer,
    alt: p.alt || q,
    provider: "pexels",
    sourceUrl: p.url,
  };
}

async function fromUnsplash(q: string, key: string): Promise<StockPhoto | null> {
  const data = await getJson(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=5&orientation=landscape`,
    { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" }
  );
  const results = data?.results;
  if (!results?.length) return null;
  const p = pick(results);
  return {
    url: p.urls?.regular || p.urls?.small,
    photographer: p.user?.name || "Unsplash",
    alt: p.alt_description || q,
    provider: "unsplash",
    sourceUrl: p.links?.html,
    downloadLocation: p.links?.download_location,
  };
}

async function fromPixabay(q: string, key: string): Promise<StockPhoto | null> {
  const data = await getJson(
    `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&image_type=photo&orientation=horizontal&safesearch=true&per_page=5`
  );
  const hits = data?.hits;
  if (!hits?.length) return null;
  const p = pick(hits);
  return {
    url: p.largeImageURL || p.webformatURL,
    photographer: p.user || "Pixabay",
    alt: p.tags || q,
    provider: "pixabay",
    sourceUrl: p.pageURL,
  };
}

/** Openverse (WordPress): agrega bancos de dominio público / CC. Sin llave. */
async function fromOpenverse(q: string): Promise<StockPhoto | null> {
  const data = await getJson(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license_type=all-cc&aspect_ratio=wide&page_size=5&mature=false`
  );
  const results = data?.results;
  if (!results?.length) return null;
  const p = pick(results);
  const url = p.url;
  if (!url) return null;
  return {
    url,
    photographer: p.creator || p.source || "Openverse",
    alt: p.title || q,
    provider: "openverse",
    sourceUrl: p.foreign_landing_url,
  };
}

/** Último recurso. Ver la advertencia del encabezado. */
async function fromUnsplashNapi(q: string): Promise<StockPhoto | null> {
  const data = await getJson(
    `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(q)}&per_page=5&orientation=landscape`
  );
  const results = data?.results;
  if (!results?.length) return null;
  const p = pick(results);
  return {
    url: p.urls?.regular || p.urls?.small,
    photographer: p.user?.name || "Unsplash",
    alt: p.alt_description || q,
    provider: "unsplash-napi",
    sourceUrl: p.links?.html,
  };
}

// ==================== CADENA ====================

/**
 * Devuelve la primera foto que encuentre, probando banco por banco.
 *
 * Un banco que falla o no encuentra nada **no rompe la cadena**: se pasa al
 * siguiente y se loguea. Devolver `null` sólo ocurre si TODOS fallaron, y ahí el
 * caller cae a DALL·E o a un placeholder.
 */
export async function searchStockPhoto(
  query: string,
  keys: StockPhotoKeys = {}
): Promise<StockPhoto | null> {
  const pexelsKey = keys.pexelsApiKey || process.env.PEXELS_API_KEY;
  const unsplashKey = keys.unsplashAccessKey || process.env.UNSPLASH_ACCESS_KEY;
  const pixabayKey = keys.pixabayApiKey || process.env.PIXABAY_API_KEY;

  // El orden es por CALIDAD, no por comodidad. Openverse va al final aunque no
  // pida llave: agrega bancos CC (Flickr, Sketchfab…) cuyas fotos sirven de red
  // de seguridad pero desentonan como hero. Ponerlo antes taparía a Unsplash y
  // empeoraría el resultado de las orgs que hoy sí reciben una foto decente.
  const chain: [string, () => Promise<StockPhoto | null>][] = [];
  if (pexelsKey) chain.push(["pexels", () => fromPexels(query, pexelsKey)]);
  if (unsplashKey) chain.push(["unsplash", () => fromUnsplash(query, unsplashKey)]);
  if (pixabayKey) chain.push(["pixabay", () => fromPixabay(query, pixabayKey)]);
  if (!unsplashKey) chain.push(["unsplash-napi", () => fromUnsplashNapi(query)]);
  chain.push(["openverse", () => fromOpenverse(query)]);

  for (const [name, fn] of chain) {
    try {
      const photo = await fn();
      if (photo?.url) {
        if (photo.downloadLocation && unsplashKey) {
          void trackUnsplashDownload(photo.downloadLocation, unsplashKey);
        }
        return photo;
      }
      console.warn(`[stock] ${name}: 0 resultados para "${query}"`);
    } catch (e) {
      console.warn(`[stock] ${name} falló para "${query}":`, (e as Error).message);
    }
  }
  return null;
}

/**
 * Le acredita el uso al autor en Unsplash. Best-effort y sin await: si falla, la
 * imagen igual se usa — pero se intenta siempre, porque es requisito de su API.
 */
async function trackUnsplashDownload(location: string, key: string) {
  try {
    await fetch(location, {
      headers: { Authorization: `Client-ID ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    /* la atribución fallida no puede tumbar una generación */
  }
}
