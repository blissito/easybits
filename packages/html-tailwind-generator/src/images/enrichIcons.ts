interface IconMatch {
  query: string;
  fullMatch: string;
}

/**
 * Sets de iconos que resolvemos, con su licencia.
 *
 * ⚠️ `trademark: true` (Simple Icons) = el ARCHIVO es CC0 pero la MARCA sigue viva:
 * sirve para enlazar/referirse a esa empresa, nunca como logo de un cliente ni como
 * icono decorativo, y no se deforma. Quien consuma `searchIcons` debe propagar este
 * flag a quien decide.
 */
export const ICON_SETS = {
  lucide: { name: "Lucide", license: "ISC", trademark: false, style: "outline" },
  heroicons: { name: "Heroicons", license: "MIT", trademark: false, style: "outline" },
  "material-symbols": { name: "Material Symbols", license: "Apache-2.0", trademark: false, style: "filled" },
  tabler: { name: "Tabler", license: "MIT", trademark: false, style: "outline" },
  ph: { name: "Phosphor", license: "MIT", trademark: false, style: "duotone" },
  "simple-icons": { name: "Simple Icons", license: "CC0-1.0", trademark: true, style: "brand" },
} as const;

export type IconPrefix = keyof typeof ICON_SETS;

/**
 * Orden de resolución para `data-icon-query` sin prefijo.
 * ⚠️ NO REORDENAR: el orden ES comportamiento — cambia el icono que ya resolvieron
 * todas las landings y documentos generados hasta hoy.
 */
export const DEFAULT_PREFIXES: IconPrefix[] = ["lucide", "heroicons", "material-symbols"];

const API_BASE = (
  typeof process !== "undefined" ? process.env?.ICONIFY_API_BASE : undefined
) || "https://api.iconify.design";

const iconCache = new Map<string, string | null>();

/**
 * Find all `data-icon-query="name"` spans in HTML.
 */
export function findIconSlots(html: string): IconMatch[] {
  const matches: IconMatch[] = [];
  const regex = /<span\s[^>]*data-icon-query="([^"]+)"[^>]*><\/span>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    matches.push({ query: m[1], fullMatch: m[0] });
  }
  return matches;
}

export interface FetchIconOptions {
  /** Sets a probar, en orden. Default: DEFAULT_PREFIXES. */
  prefixes?: readonly string[];
  /** Alto del SVG. Default "1em" (hereda el tamaño del contenedor). */
  height?: string;
  /** Color. Default "currentColor" (hereda el color del contenedor). */
  color?: string;
}

/**
 * Trae un SVG de Iconify. Si `name` viene con prefijo (`lucide:heart`) se respeta
 * ese set y no se barren los demás — así lo que devuelve `searchIcons` es pegable
 * literalmente en `data-icon-query` y resuelve al MISMO icono.
 */
export async function fetchIconSvg(
  name: string,
  options: FetchIconOptions = {}
): Promise<string | null> {
  const height = options.height ?? "1em";
  const color = options.color ?? "currentColor";
  const cacheKey = `${name}|${height}|${color}`;
  if (iconCache.has(cacheKey)) return iconCache.get(cacheKey)!;

  const [maybePrefix, ...rest] = name.split(":");
  const explicit = rest.length > 0;
  const iconName = explicit ? rest.join(":") : name;
  const prefixes = explicit ? [maybePrefix] : (options.prefixes ?? DEFAULT_PREFIXES);

  const qs = `?height=${encodeURIComponent(height)}&color=${encodeURIComponent(color)}`;
  for (const prefix of prefixes) {
    try {
      const res = await fetch(`${API_BASE}/${prefix}/${iconName}.svg${qs}`);
      if (res.ok) {
        const svg = await res.text();
        if (svg.startsWith("<svg")) {
          iconCache.set(cacheKey, svg);
          return svg;
        }
      }
    } catch {
      // try next prefix
    }
  }

  iconCache.set(cacheKey, null);
  return null;
}

export interface IconResult {
  /** `prefix:name`, pegable tal cual en data-icon-query */
  name: string;
  prefix: string;
  set: string;
  svg: string;
  license: string;
  /** true = es logo de marca: la marca sigue protegida aunque el archivo sea CC0 */
  trademark: boolean;
}

export interface SearchIconsOptions {
  limit?: number;
  /** Filtra por estilo del set (outline/filled/duotone/brand). */
  style?: string;
  /** Restringe la búsqueda a estos sets. Default: todos los de ICON_SETS. */
  prefixes?: readonly string[];
}

/**
 * Busca iconos y devuelve candidatos con el SVG INLINE ya resuelto.
 *
 * Nunca lanza: si Iconify no responde devuelve `[]`. Como tool de agente, un throw
 * aquí sería un fallo de cara al usuario por un servicio de terceros opcional.
 */
export async function searchIcons(
  query: string,
  options: SearchIconsOptions = {}
): Promise<IconResult[]> {
  const limit = Math.min(Math.max(options.limit ?? 6, 1), 24);
  const prefixes =
    options.prefixes ??
    (options.style
      ? (Object.keys(ICON_SETS) as IconPrefix[]).filter(
          (p) => ICON_SETS[p].style === options.style
        )
      : (Object.keys(ICON_SETS) as IconPrefix[]));
  if (prefixes.length === 0) return [];

  let names: string[] = [];
  try {
    const url = `${API_BASE}/search?query=${encodeURIComponent(query)}&limit=${Math.min(limit * 4, 96)}&prefixes=${prefixes.join(",")}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { icons?: string[] };
    names = (data.icons ?? []).slice(0, limit);
  } catch {
    return [];
  }
  if (names.length === 0) return [];

  const settled = await Promise.allSettled(
    names.map(async (full): Promise<IconResult | null> => {
      const svg = await fetchIconSvg(full);
      if (!svg) return null;
      const prefix = full.split(":")[0];
      const meta = ICON_SETS[prefix as IconPrefix];
      return {
        name: full,
        prefix,
        set: meta?.name ?? prefix,
        svg,
        license: meta?.license ?? "unknown",
        trademark: meta?.trademark ?? false,
      };
    })
  );

  return settled
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((x): x is IconResult => x !== null);
}

/**
 * Replace all `data-icon-query` spans with real inline SVGs from Iconify.
 */
export async function enrichSectionIcons(html: string): Promise<string> {
  const slots = findIconSlots(html);
  if (slots.length === 0) return html;

  // Dedupe queries
  const uniqueQueries = [...new Set(slots.map((s) => s.query))];
  const resolved = await Promise.allSettled(
    uniqueQueries.map(async (query) => {
      const svg = await fetchIconSvg(query);
      return { query, svg };
    })
  );

  const svgMap = new Map<string, string>();
  for (const r of resolved) {
    if (r.status === "fulfilled" && r.value.svg) {
      svgMap.set(r.value.query, r.value.svg);
    }
  }

  let result = html;
  for (const slot of slots) {
    const svg = svgMap.get(slot.query);
    if (!svg) continue;

    // Extract classes from the original span to apply to the SVG
    const classMatch = slot.fullMatch.match(/class="([^"]*)"/);
    const classes = classMatch?.[1] || "inline-block w-5 h-5";

    // Add classes to the SVG element
    const svgWithClasses = svg.replace("<svg", `<svg class="${classes}"`);
    result = result.replace(slot.fullMatch, svgWithClasses);
  }

  return result;
}
