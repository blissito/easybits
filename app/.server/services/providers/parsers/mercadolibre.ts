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

export function parseMercadoLibreListing(html: string): MeliProduct[] {
  const out: MeliProduct[] = [];
  const cards = html.match(CARD_RE) ?? [];
  for (const card of cards) {
    const title = card.match(TITLE_RE)?.[1];
    if (!title) continue;
    const url = card.match(LINK_RE)?.[1] ?? card.match(LINK_ALT_RE)?.[1] ?? "";
    const priceRaw = card.match(PRICE_RE)?.[1];
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
