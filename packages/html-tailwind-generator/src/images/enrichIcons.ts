interface IconMatch {
  query: string;
  fullMatch: string;
}

const ICON_PREFIXES = ["lucide", "heroicons", "material-symbols"] as const;

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

/**
 * Fetch an SVG icon from Iconify API, trying multiple icon sets.
 */
async function fetchIcon(name: string): Promise<string | null> {
  if (iconCache.has(name)) return iconCache.get(name)!;

  for (const prefix of ICON_PREFIXES) {
    try {
      const url = `https://api.iconify.design/${prefix}/${name}.svg?height=1em&color=currentColor`;
      const res = await fetch(url);
      if (res.ok) {
        const svg = await res.text();
        if (svg.startsWith("<svg")) {
          iconCache.set(name, svg);
          return svg;
        }
      }
    } catch {
      // try next prefix
    }
  }

  iconCache.set(name, null);
  return null;
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
      const svg = await fetchIcon(query);
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
