/**
 * Parser del listado de Mercado Libre México (`listado.mercadolibre.com.mx/<q>`).
 * El proveedor no tiene scraper con esquema para .com.mx, así que la página se
 * lee cruda y se estructura aquí. Verificado 2026-09-04: 48 productos por página.
 *
 * Se apoya en clases estables del design system de MELI (`poly-component__*`,
 * `andes-money-amount__*`). Si MELI las cambia, el fixture de test lo delata.
 */
export interface MeliProduct {
  title: string;
  price: number | null;
  currency: string;
  url: string;
  image: string | null;
  seller: string | null;
  freeShipping: boolean;
}

const CARD_RE = /<li[^>]*class="[^"]*ui-search-layout__item[^"]*"[\s\S]*?<\/li>/g;
const TITLE_RE = /poly-component__title[^>]*>([^<]{2,200})/;
const LINK_RE = /<a[^>]+class="[^"]*poly-component__title[^"]*"[^>]+href="([^"]+)"/;
const LINK_ALT_RE = /href="(https:\/\/(?:www\.mercadolibre\.com\.mx|articulo\.mercadolibre\.com\.mx)[^"]+)"/;
const PRICE_RE = /andes-money-amount__fraction[^>]*>([\d,.]+)/;
const CURRENCY_RE = /andes-money-amount__currency-symbol[^>]*>([^<]+)/;
const IMG_RE = /<img[^>]+(?:data-src|src)="(https:\/\/http2\.mlstatic\.com[^"]+)"/;
const SELLER_RE = /poly-component__seller[^>]*>(?:Por\s+)?([^<]{2,80})/;

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/**
 * Saca cada objeto `"polycard":{…}` del estado que MELI incrusta en la página (balanceando
 * llaves y respetando strings). Ese estado viene en TODAS las variantes del listado.
 */
function* polycards(html: string): Generator<string> {
  const KEY = '"polycard":{';
  let i = 0;
  while ((i = html.indexOf(KEY, i)) !== -1) {
    const start = i + KEY.length - 1;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let k = start;
    for (; k < html.length; k++) {
      const c = html[k];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) break;
    }
    yield html.slice(start, k + 1);
    i = k;
  }
}

type Polycard = {
  metadata?: { id?: string; product_id?: string; url?: string };
  pictures?: { pictures?: { id?: string }[] };
  components?: {
    type?: string;
    title?: { text?: string };
    seller?: { text?: string };
    price?: { current_price?: { value?: number; currency?: string } };
    shipping_v2?: unknown;
  }[];
};

// Los textos traen marcadores de ícono: "Por Apple {icon_cockade}".
const clean = (t?: string) => (t ?? "").replace(/\{[a-z_]+\}/g, "").replace(/^\s*Por\s+/, "").trim();

/**
 * Lee los productos del ESTADO incrustado, no de las tarjetas. Medido 22-oct: de 5 descargas
 * iguales de «audifonos», 3 traían 61 tarjetas HTML y 2 casi ninguna (la página se pinta en el
 * navegador), pero las 5 traían el estado con los ~60 productos.
 */
function parseFromState(html: string): MeliProduct[] {
  const byId = new Map<string, MeliProduct>();
  for (const raw of polycards(html)) {
    let card: Polycard;
    try {
      card = JSON.parse(raw) as Polycard;
    } catch {
      continue;
    }
    const id = card.metadata?.id;
    if (!id || byId.has(id)) continue; // MELI repite cada producto ~3 veces en el estado
    const comp = (type: string) => card.components?.find((c) => c.type === type);
    const title = clean(comp("title")?.title?.text);
    if (!title) continue;
    const current = comp("price")?.price?.current_price;
    const rawUrl = card.metadata?.url ?? "";
    // Los anuncios apuntan a un contador de clics; se reemplaza por la ficha canónica.
    const url = rawUrl && !rawUrl.startsWith("click1.")
      ? `https://${rawUrl.replace(/^https?:\/\//, "")}`
      : card.metadata?.product_id
        ? `https://www.mercadolibre.com.mx/p/${card.metadata.product_id}`
        : `https://articulo.mercadolibre.com.mx/${id.replace(/^([A-Z]+)(\d+)$/, "$1-$2")}`;
    const pic = card.pictures?.pictures?.[0]?.id;
    byId.set(id, {
      title: decode(title),
      price: typeof current?.value === "number" ? current.value : null,
      currency: current?.currency === "MXN" || !current?.currency ? "$" : current.currency,
      url: url.split("#")[0],
      image: pic ? `https://http2.mlstatic.com/D_NQ_NP_${pic}-O.webp` : null,
      seller: clean(comp("seller")?.seller?.text) || null,
      freeShipping: /Env[ií]o gratis/i.test(JSON.stringify(card.components ?? [])),
    });
  }
  return [...byId.values()];
}

export function parseMercadoLibreListing(html: string): MeliProduct[] {
  const fromState = parseFromState(html);
  const fromCards = parseFromCards(html);
  // Gana el estado (precio actual exacto, URL canónica de los anuncios). Las tarjetas sólo
  // entran si el estado trae claramente menos: el día que MELI lo cambie, siguen funcionando.
  return fromState.length >= fromCards.length * 0.9 ? fromState : fromCards;
}

function parseFromCards(html: string): MeliProduct[] {
  const out: MeliProduct[] = [];
  const cards = html.match(CARD_RE) ?? [];
  for (const card of cards) {
    const title = card.match(TITLE_RE)?.[1];
    if (!title) continue;
    const url = card.match(LINK_RE)?.[1] ?? card.match(LINK_ALT_RE)?.[1] ?? "";
    // El precio ACTUAL vive en poly-price__current; el primero de la tarjeta es el tachado.
    const current = card.slice(Math.max(0, card.indexOf("poly-price__current")));
    const priceRaw = current.match(PRICE_RE)?.[1];
    const price = priceRaw ? Number(priceRaw.replace(/[.,]/g, "")) : null;
    out.push({
      title: decode(title),
      price: Number.isFinite(price as number) ? price : null,
      currency: decode(card.match(CURRENCY_RE)?.[1] ?? "$"),
      url: decode(url).split("#")[0],
      image: card.match(IMG_RE)?.[1] ?? null,
      seller: card.match(SELLER_RE)?.[1] ? decode(card.match(SELLER_RE)![1]) : null,
      freeShipping: /Env[ií]o gratis/i.test(card),
    });
  }
  return out;
}

export function mercadoLibreListingUrl(query: string, page = 1): string {
  const slug = query
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  // MELI pagina por offset de 48 + "_NoIndex_True" no hace falta.
  const offset = (page - 1) * 48 + 1;
  return page > 1
    ? `https://listado.mercadolibre.com.mx/${slug}_Desde_${offset}`
    : `https://listado.mercadolibre.com.mx/${slug}`;
}
