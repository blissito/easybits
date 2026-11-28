/**
 * Parámetros de búsqueda → URL por motor. Pieza pura (sin red) para poder probarla.
 *
 * Dos «países» distintos que antes se mezclaban:
 * - País de BÚSQUEDA (`gl`/`hl`/`lr`/`mkt`): va en la URL y localiza los resultados.
 * - País de SALIDA del proxy (`country` del cuerpo de la petición): por dónde sale la IP.
 *   El proveedor no deja salir por algunos países (RU dio 403 el 28-nov-2026), pero
 *   buscar «como en Rusia» sólo necesita `gl=ru`/`hl=ru`, que sí funciona sin salir de ahí.
 */

export type SearchEngine = "google" | "bing" | "yandex" | "duckduckgo";
export type SearchType = "web" | "news" | "images" | "shopping" | "videos" | "places";
export type SearchTime = "hour" | "day" | "week" | "month" | "year";

export interface SearchParams {
  query: string;
  engine?: SearchEngine;
  /** País de búsqueda, ISO 3166-1 de 2 letras. */
  country?: string;
  /** Idioma de la interfaz y de los resultados (ISO 639-1: es, en, ru…). */
  language?: string;
  /** Ciudad o región en texto («Monterrey, Nuevo León, México», «Москва»). */
  location?: string;
  /** Página de resultados, desde 1. */
  page?: number;
  type?: SearchType;
  time?: SearchTime;
  device?: "desktop" | "mobile";
}

export interface ResolvedSearch {
  engine: SearchEngine;
  country: string;
  language: string;
  location?: string;
  page: number;
  type: SearchType;
  time?: SearchTime;
  /** URL que se pide al proveedor. */
  url: string;
  /** serp = API de buscadores (JSON ya parseado); html = lectura de la página y parser propio. */
  via: "serp" | "html";
  /** País de salida del proxy; ausente si no se pide o si el proveedor no lo permite. */
  exitCountry?: string;
}

export class SearchParamsError extends Error {}

/** Países por los que el proveedor no deja salir (403 «Country XX is not permitted for targeting»). */
export const BLOCKED_EXIT_COUNTRIES = new Set(["ru", "by", "ir", "kp", "sy", "cu"]);

// Idioma por defecto de cada país y país por defecto de cada idioma.
const COUNTRY_LANG: Record<string, string> = {
  mx: "es", es: "es", ar: "es", co: "es", cl: "es", pe: "es", ve: "es", ec: "es", gt: "es", cr: "es", uy: "es", py: "es", bo: "es", do: "es", pa: "es", hn: "es", sv: "es", ni: "es",
  us: "en", gb: "en", ca: "en", au: "en", nz: "en", ie: "en", in: "en",
  br: "pt", pt: "pt", ru: "ru", by: "ru", kz: "ru", ua: "uk", fr: "fr", de: "de", at: "de", ch: "de", it: "it",
  jp: "ja", kr: "ko", cn: "zh", tw: "zh", tr: "tr", pl: "pl", nl: "nl", se: "sv", il: "he", sa: "ar", ae: "ar", eg: "ar", gr: "el",
};
const LANG_COUNTRY: Record<string, string> = {
  es: "mx", en: "us", pt: "br", ru: "ru", uk: "ua", fr: "fr", de: "de", it: "it", ja: "jp", ko: "kr", zh: "cn",
  tr: "tr", pl: "pl", nl: "nl", sv: "se", he: "il", ar: "sa", el: "gr",
};

// Palabras frecuentes que delatan español en texto latino sin acentos.
const ES_HINT = /\b(de|la|el|los|las|en|para|con|que|por|del|precio|precios|cómo|como|dónde|donde|mejor|cuánto|cuanto|méxico|mexico|y)\b|[ñáéíóú¿¡]/i;
const PT_HINT = /\b(não|você|preço|onde|melhor|são|ção)\b|[ãõç]/i;

/** Idioma probable de la consulta por su escritura (cirílico, griego, árabe, CJK…) o por palabras. */
export function detectLanguage(text: string): string {
  if (/[Ѐ-ӿ]/.test(text)) return /[іїєґ]/i.test(text) ? "uk" : "ru";
  if (/[Ͱ-Ͽ]/.test(text)) return "el";
  if (/[֐-׿]/.test(text)) return "he";
  if (/[؀-ۿ]/.test(text)) return "ar";
  if (/[぀-ヿ]/.test(text)) return "ja";
  if (/[가-힯]/.test(text)) return "ko";
  if (/[一-鿿]/.test(text)) return "zh";
  if (PT_HINT.test(text)) return "pt";
  if (ES_HINT.test(text)) return "es";
  return "en";
}

// Regiones de Yandex (`lr`). Sólo las verificadas; sin ciudad se usa la del país.
const YANDEX_CITY: Array<[RegExp, number]> = [
  [/mosc|моск/i, 213],
  [/peter|петерб|питер/i, 2],
  [/minsk|минск/i, 157],
  [/kyiv|kiev|киев|київ/i, 143],
  [/almaty|алматы/i, 162],
  [/istanbul|стамбул/i, 11508],
];
const YANDEX_COUNTRY: Record<string, number> = { ru: 225, by: 149, kz: 159, ua: 187, tr: 983 };

const GOOGLE_TYPE: Record<Exclude<SearchType, "web">, string> = {
  news: "&tbm=nws",
  videos: "&tbm=vid",
  places: "&tbm=lcl",
  shopping: "&udm=28",
  images: "&udm=2",
};
const GOOGLE_TIME: Record<SearchTime, string> = { hour: "qdr:h", day: "qdr:d", week: "qdr:w", month: "qdr:m", year: "qdr:y" };
// Intervalos de Bing Noticias (qft=interval="N").
const BING_NEWS_TIME: Partial<Record<SearchTime, string>> = { hour: "4", day: "7", week: "8", month: "9" };
const DDG_TIME: Partial<Record<SearchTime, string>> = { day: "d", week: "w", month: "m", year: "y" };

const ENGINES: SearchEngine[] = ["google", "bing", "yandex", "duckduckgo"];
const TYPES: SearchType[] = ["web", "news", "images", "shopping", "videos", "places"];
const TIMES: SearchTime[] = ["hour", "day", "week", "month", "year"];

export function resolveSearch(p: SearchParams): ResolvedSearch {
  const query = p.query?.trim();
  if (!query) throw new SearchParamsError("query es obligatorio");
  const engine = p.engine ?? "google";
  if (!ENGINES.includes(engine)) throw new SearchParamsError(`engine inválido: usa ${ENGINES.join(" | ")}`);
  const type = p.type ?? "web";
  if (!TYPES.includes(type)) throw new SearchParamsError(`type inválido: usa ${TYPES.join(" | ")}`);
  if (p.time && !TIMES.includes(p.time)) throw new SearchParamsError(`time inválido: usa ${TIMES.join(" | ")}`);
  if (type !== "web" && engine !== "google" && !(engine === "bing" && type === "news")) {
    throw new SearchParamsError(`type "${type}" sólo está disponible con engine "google" (y news también con "bing")`);
  }
  const bingNews = engine === "bing" && type === "news";
  if (p.time && (engine === "yandex" || (engine === "bing" && !bingNews))) {
    throw new SearchParamsError(`time sólo está disponible con engine "google", "duckduckgo" o "bing" con type "news"`);
  }
  if (bingNews && p.time === "year") throw new SearchParamsError(`time "year" no está disponible en noticias de bing`);
  const page = Math.max(1, Math.floor(p.page ?? 1));
  if (engine === "duckduckgo" && page > 1) throw new SearchParamsError(`page > 1 no está disponible con engine "duckduckgo"`);

  const countryIn = p.country?.trim().toLowerCase();
  if (countryIn && !/^[a-z]{2}$/.test(countryIn)) throw new SearchParamsError("country debe ser un código de 2 letras (mx, us, ru…)");
  const langIn = p.language?.trim().toLowerCase();
  if (langIn && !/^[a-z]{2}(-[a-z]{2,4})?$/.test(langIn)) throw new SearchParamsError("language debe ser un código como es, en, ru o pt-br");

  // Nunca se deja la búsqueda al azar: sin idioma se deduce del país o del texto, y sin país, del idioma.
  const language = langIn ?? (countryIn ? COUNTRY_LANG[countryIn] : undefined) ?? detectLanguage(query);
  const baseLang = language.split("-")[0];
  const country = countryIn ?? LANG_COUNTRY[baseLang] ?? "us";
  // La IP sale por el país de búsqueda (dado o deducido), salvo que el proveedor no lo permita.
  const exitCountry = !BLOCKED_EXIT_COUNTRIES.has(country) ? country : undefined;
  const location = p.location?.trim() || undefined;
  const q = encodeURIComponent(query);

  let url: string;
  let via: "serp" | "html" = "serp";
  switch (engine) {
    case "google": {
      // nfpr=1: Google busca exactamente lo escrito; sin él, según la IP, «ghosty» se volvía «ghostly».
      url = `https://www.google.com/search?q=${q}&hl=${baseLang}&gl=${country}&nfpr=1`;
      if (location) url += `&uule=${encodeURIComponent(location).replace(/%20/g, "+")}`;
      if (page > 1) url += `&start=${(page - 1) * 10}`;
      if (type !== "web") url += GOOGLE_TYPE[type];
      if (p.time) url += `&tbs=${GOOGLE_TIME[p.time]}`;
      if (p.device === "mobile") url += "&brd_mobile=1";
      url += "&brd_json=1";
      break;
    }
    case "bing": {
      url = `https://www.bing.com/${type === "news" ? "news/" : ""}search?q=${q}&setlang=${baseLang}&cc=${country}&mkt=${baseLang}-${country.toUpperCase()}`;
      if (type === "news" && p.time) url += `&qft=${encodeURIComponent(`interval="${BING_NEWS_TIME[p.time]}"`)}`;
      if (page > 1) url += `&first=${(page - 1) * 10 + 1}`;
      url += "&brd_json=1";
      break;
    }
    case "yandex": {
      via = "html";
      const city = location ? YANDEX_CITY.find(([re]) => re.test(location))?.[1] : undefined;
      const lr = city ?? YANDEX_COUNTRY[country];
      url = `https://yandex.ru/search/?text=${q}&lang=${baseLang}`;
      if (lr) url += `&lr=${lr}`;
      if (page > 1) url += `&p=${page - 1}`;
      break;
    }
    case "duckduckgo": {
      via = "html";
      url = `https://html.duckduckgo.com/html/?q=${q}&kl=${country}-${baseLang}`;
      if (p.time && DDG_TIME[p.time]) url += `&df=${DDG_TIME[p.time]}`;
      break;
    }
  }
  return { engine, country, language, location, page, type, time: p.time, url, via, exitCountry };
}
