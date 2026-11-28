/**
 * Parsers de páginas de resultados que el proveedor no entrega en JSON (Yandex y
 * DuckDuckGo: «JSON output is not supported»). Se leen como HTML y se estructuran
 * aquí, igual que Mercado Libre (`mercadolibre.ts`). Si cambian sus clases, el
 * fixture de `test/web-search.test.ts` lo delata.
 */
import type { SearchResultItem } from "../search/normalize";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", nbsp: " ", apos: "'" };

export function htmlText(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (ENTITIES[e.toLowerCase()]) return ENTITIES[e.toLowerCase()];
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function sourceOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/** Yandex (`yandex.ru/search`): cada resultado es un `<li class="serp-item">`; los anuncios llevan `AdvLabel`. */
export function parseYandexSerp(html: string): { results: SearchResultItem[]; hasNext: boolean } {
  const results: SearchResultItem[] = [];
  const items = html.split(/(?=<li class="serp-item)/).slice(1);
  for (const raw of items) {
    const end = raw.indexOf("</li>");
    const item = end > 0 ? raw.slice(0, end) : raw;
    if (/AdvLabel|yabs\.yandex|\/an\/count\//.test(item)) continue;
    const href =
      item.match(/class="[^"]*OrganicTitle-Link[^"]*"[^>]*href="([^"]+)"/)?.[1] ??
      item.match(/href="([^"]+)"[^>]*class="[^"]*OrganicTitle-Link/)?.[1];
    const title = item.match(/OrganicTitle-LinkText[^>]*>([\s\S]*?)<\/span>/)?.[1];
    if (!href || !title || !/^https?:\/\//.test(href)) continue;
    const url = htmlText(href);
    if (/^https?:\/\/(?:[a-z]+\.)?yandex\.[a-z]+\//.test(url)) continue; // servicios propios (Алиса, mapas…)
    const snippet = item.match(/OrganicTextContent[^>]*>([\s\S]*?)<\/span>/)?.[1];
    results.push({
      position: results.length + 1,
      title: htmlText(title),
      url,
      snippet: snippet ? htmlText(snippet).replace(/\s*·\s*$/, "") : undefined,
      source: sourceOf(url),
    });
  }
  return { results, hasNext: /class="[^"]*Pager-Item_type_next|aria-label="Следующая/.test(html) || results.length >= 8 };
}

/** DuckDuckGo HTML (`html.duckduckgo.com/html`): `result__a` lleva la URL real en `uddg`. */
export function parseDuckDuckGoSerp(html: string): { results: SearchResultItem[]; hasNext: boolean } {
  const results: SearchResultItem[] = [];
  const blocks = html.split(/(?=<div class="result results_links)/).slice(1);
  for (const b of blocks) {
    if (/result--ad/.test(b)) continue;
    const a = b.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    let url = htmlText(a[1]);
    const uddg = url.match(/[?&]uddg=([^&]+)/)?.[1];
    if (uddg) url = decodeURIComponent(uddg);
    if (url.startsWith("//")) url = `https:${url}`;
    if (!/^https?:\/\//.test(url)) continue;
    const snippet = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)?.[1];
    results.push({
      position: results.length + 1,
      title: htmlText(a[2]),
      url,
      snippet: snippet ? htmlText(snippet) : undefined,
      source: sourceOf(url),
    });
  }
  return { results, hasNext: false };
}
