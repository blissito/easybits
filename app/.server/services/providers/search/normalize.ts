/**
 * Respuesta de búsqueda con UNA sola forma para los 4 motores: lo que un agente lee.
 * Sin íconos en base64, sin `tracking_link`, y con la URL real del resultado
 * (Google a veces da `google.com/goto?url=…`; se resuelve siguiendo su redirección).
 */

export interface SearchResultItem {
  position: number;
  title: string;
  url: string;
  snippet?: string;
  date?: string;
  source?: string;
  price?: string;
  rating?: number;
  image?: string;
  /** true = Google no dio la liga exacta y la URL se armó con la ruta que muestra (puede ser la portada del sitio). */
  urlApprox?: boolean;
  /** Interno: la ruta visible de Google («https://sitio.com › blog › nota»), para el respaldo de los goto. */
  displayLink?: string;
}

export interface NormalizedSerp {
  results: SearchResultItem[];
  answer?: string;
  peopleAlsoAsk?: string[];
  related?: string[];
  hasNext: boolean;
  /** Lo que el motor reporta de sí mismo (idioma/país/ciudad), para comprobar la localización. */
  reported?: { language?: string; country?: string; location?: string };
}

type Json = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const notData = (v: string | undefined) => (v && !v.startsWith("data:") ? v : undefined);

// Listas de resultados que trae el JSON parseado del proveedor, por tipo de búsqueda.
const LIST_KEYS = ["organic", "news", "top_stories", "images", "shopping", "videos", "snack_pack", "local_results"];

export function normalizeSerpJson(body: Json): NormalizedSerp {
  const key = LIST_KEYS.find((k) => Array.isArray(body[k]) && (body[k] as unknown[]).length > 0);
  const list = (key ? (body[key] as Json[]) : []) ?? [];
  const results: SearchResultItem[] = [];
  for (const r of list) {
    const url = str(r.link) ?? str(r.url) ?? str(r.website) ?? str(r.maps_link);
    const title = str(r.title) ?? str(r.name);
    if (!url || !title) continue;
    const rating = typeof r.rating === "number" ? r.rating : Number(r.rating) || undefined;
    results.push({
      position: results.length + 1,
      title,
      url,
      snippet: str(r.description) ?? str(r.snippet) ?? str(r.address),
      date: str(r.date),
      source: str(r.source) ?? str(r.site_name),
      price: str(r.price),
      rating,
      image: notData(str(r.image)) ?? notData(str(r.thumbnail)),
      displayLink: str(r.display_link),
    });
  }
  const knowledge = body.knowledge as Json | undefined;
  const featured = (body.featured_snippets as Json[] | undefined)?.[0];
  const answer = str(featured?.description) ?? str(knowledge?.description);
  const paa = (body.people_also_ask as Json[] | undefined)?.map((x) => str(x.question)).filter(Boolean) as string[] | undefined;
  const related = (body.related as Json[] | undefined)?.map((x) => str(x.text)).filter(Boolean) as string[] | undefined;
  const pagination = body.pagination as Json | undefined;
  const general = (body.general ?? {}) as Json;
  return {
    results,
    answer,
    peopleAlsoAsk: paa?.length ? paa : undefined,
    related: related?.length ? related : undefined,
    hasNext: !!pagination?.next_page,
    reported: {
      language: str(general.language),
      country: str(general.country_code),
      location: str(general.location),
    },
  };
}

const GOTO = /^https?:\/\/(?:www\.)?google\.[a-z.]+\/goto\?/;
const TRANSLATE = /^https?:\/\/translate\.google\.[a-z.]+\/translate\?(?:[^#]*&)?u=([^&#]+)/;

/** Si Google envolvió el resultado en su traductor, regresa la página original. */
export function unwrapTranslate(url: string): string {
  const m = url.match(TRANSLATE);
  if (!m) return url;
  const inner = decodeURIComponent(m[1]);
  return /^https?:\/\//.test(inner) ? inner : url;
}

/**
 * URL a partir de la ruta visible de Google. Sin «›» es la URL exacta; con migas, si todas parecen
 * trozos de ruta (sin espacios ni «...») se unen, y si no, se queda la portada del sitio.
 */
export function urlFromDisplayLink(display: string | undefined): { url: string; exact: boolean } | null {
  if (!display) return null;
  const parts = display.split(/\s*›\s*/).map((p) => p.trim()).filter(Boolean);
  let origin: URL;
  try {
    origin = new URL(parts[0]);
  } catch {
    return null;
  }
  if (parts.length === 1) return { url: origin.href, exact: true };
  const segs = parts.slice(1);
  if (segs.every((p) => /^[a-z0-9._~%-]+$/i.test(p) && !p.includes("..."))) {
    return { url: `${origin.origin}/${segs.join("/")}`, exact: false };
  }
  return { url: `${origin.origin}/`, exact: false };
}

const fromBody = (html: string) => html.match(/<A HREF="(https?:\/\/[^"]+)"/i)?.[1]?.replace(/&amp;/g, "&");

/**
 * Cambia los `google.com/goto?url=…` por la URL real: primero sigue el 302 de Google (gratis);
 * si Google contesta con su página de espera (pasa con varias seguidas), arma la URL con la
 * ruta visible del resultado y la marca `urlApprox`. Sólo se descarta si no hay ninguna de las dos.
 */
export async function resolveGotoLinks(
  results: SearchResultItem[],
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3000,
): Promise<SearchResultItem[]> {
  const out = await Promise.all(
    results.map(async (r): Promise<SearchResultItem | null> => {
      const { displayLink, ...item } = r;
      item.url = unwrapTranslate(item.url);
      if (!GOTO.test(item.url)) return item;
      try {
        const res = await fetchImpl(item.url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
        const loc = res.headers.get("location") ?? (res.status >= 300 && res.status < 400 ? fromBody(await res.text()) : null);
        if (loc && /^https?:\/\//.test(loc) && !GOTO.test(loc)) return { ...item, url: unwrapTranslate(loc) };
      } catch {
        // cae al respaldo
      }
      const approx = urlFromDisplayLink(displayLink);
      if (!approx) return null;
      return approx.exact ? { ...item, url: approx.url } : { ...item, url: approx.url, urlApprox: true };
    }),
  );
  return out.filter((r): r is SearchResultItem => r !== null).map((r, i) => ({ ...r, position: i + 1 }));
}
