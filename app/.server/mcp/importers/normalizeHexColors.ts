/**
 * Normalize arbitrary hex colors in HTML to semantic Tailwind tokens.
 *
 * Complements `sanitizeSemanticColors` (which handles named Tailwind classes
 * like `bg-blue-500` → `bg-secondary`). This pass targets the arbitrary-value
 * and inline-style cases that tools like Claude Design, Gamma, and Tome emit:
 *
 *   - Tailwind arbitrary values: `bg-[#B45309]`, `text-[#222]`, `border-[#...]`
 *   - Inline style attributes: `style="color: #B45309; background: #FDF7EF"`
 *
 * Algorithm (deterministic, no ML):
 *   1. Scan HTML for all hex occurrences grouped by role (bg / text / border).
 *   2. Count frequency per hex value per role.
 *   3. Score each hex by HSL:
 *        - lightness > 0.9 → "surface" candidate
 *        - lightness < 0.15 → "on-surface" candidate
 *        - saturation > 0.4 → "primary" / "accent" candidate
 *   4. Assign roles:
 *        - Most-frequent background  → surface
 *        - Most-frequent text         → on-surface
 *        - Most-frequent saturated    → primary
 *        - Second most-frequent sat.  → accent
 *   5. Rewrite HTML replacing matched hex with semantic classes.
 *      Inline styles get the property removed and the class appended.
 */

type Role = "bg" | "text" | "border";
type Semantic = "surface" | "on-surface" | "primary" | "accent" | "secondary";

interface HexUsage {
  hex: string;   // normalized to 6-char lowercase (#rrggbb)
  role: Role;
  count: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function normalizeHex(raw: string): string {
  const h = raw.replace("#", "").toLowerCase();
  if (h.length === 3) {
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  if (h.length === 8) return `#${h.slice(0, 6)}`; // strip alpha
  return `#${h}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      case b: hue = (r - g) / d + 4; break;
    }
    hue *= 60;
  }
  return { h: hue, s, l };
}

// ── Collection ────────────────────────────────────────────────────────────

const HEX_RE = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

// Tailwind arbitrary: bg-[#xxx], text-[#xxx], border-[#xxx], etc.
const ARBITRARY_RE = /\b(bg|text|border|ring|from|to|via|outline|divide|placeholder|decoration|shadow|accent|fill|stroke|caret)-\[#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\]/g;

// Inline style hex in color / background-color / background / border-color properties
const INLINE_STYLE_RE = /(background(?:-color)?|color|border(?:-color)?|fill|stroke)\s*:\s*(#[0-9a-fA-F]{3,8})/gi;

function collectUsages(html: string): HexUsage[] {
  const counts = new Map<string, HexUsage>(); // key = `${role}|${hex}`

  const bump = (role: Role, hex: string) => {
    const n = normalizeHex(hex);
    const key = `${role}|${n}`;
    const cur = counts.get(key);
    if (cur) cur.count += 1;
    else counts.set(key, { hex: n, role, count: 1 });
  };

  // Arbitrary Tailwind values
  for (const m of html.matchAll(ARBITRARY_RE)) {
    const prefix = m[1];
    const role: Role =
      prefix === "text" || prefix === "placeholder" || prefix === "caret" ? "text" :
      prefix === "border" || prefix === "outline" || prefix === "divide" || prefix === "ring" ? "border" :
      "bg";
    bump(role, m[2]);
  }

  // Inline styles
  for (const m of html.matchAll(INLINE_STYLE_RE)) {
    const prop = m[1].toLowerCase();
    const role: Role =
      prop.startsWith("color") ? "text" :
      prop.startsWith("background") ? "bg" :
      "border";
    bump(role, m[2]);
  }

  return Array.from(counts.values());
}

// ── Role assignment ───────────────────────────────────────────────────────

interface RoleMap {
  surface?: string;      // hex
  onSurface?: string;
  primary?: string;
  accent?: string;
}

function assignRoles(usages: HexUsage[]): RoleMap {
  const bgUsages = usages.filter((u) => u.role === "bg").sort((a, b) => b.count - a.count);
  const textUsages = usages.filter((u) => u.role === "text").sort((a, b) => b.count - a.count);

  // Surface: most frequent light background
  const surface = bgUsages.find((u) => hexToHsl(u.hex).l > 0.85)?.hex
    || bgUsages[0]?.hex;

  // On-surface: most frequent dark text
  const onSurface = textUsages.find((u) => hexToHsl(u.hex).l < 0.35)?.hex
    || textUsages[0]?.hex;

  // Saturated chromatic colors sorted by saturation × frequency
  const scoreSaturation = (u: HexUsage) => {
    const { s, l } = hexToHsl(u.hex);
    // prefer saturated and non-extreme lightness
    const midBoost = 1 - Math.abs(l - 0.5) * 1.2;
    return s * Math.max(midBoost, 0.2) * Math.log2(u.count + 1);
  };
  const saturated = usages
    .filter((u) => {
      const { s } = hexToHsl(u.hex);
      return s > 0.3 && u.hex !== surface && u.hex !== onSurface;
    })
    .sort((a, b) => scoreSaturation(b) - scoreSaturation(a));

  const primary = saturated[0]?.hex;
  const accent = saturated.find((u) => u.hex !== primary)?.hex;

  return {
    surface,
    onSurface,
    primary,
    accent,
  };
}

// ── Rewriting ─────────────────────────────────────────────────────────────

function roleToSemantic(role: Role, semantic: Semantic): string {
  if (role === "text") {
    if (semantic === "surface") return "text-surface";
    if (semantic === "on-surface") return "text-on-surface";
    if (semantic === "primary") return "text-primary";
    if (semantic === "accent") return "text-accent";
    return "text-secondary";
  }
  if (role === "border") {
    if (semantic === "primary") return "border-primary";
    if (semantic === "accent") return "border-accent";
    if (semantic === "surface") return "border-surface";
    if (semantic === "on-surface") return "border-on-surface";
    return "border-secondary";
  }
  // bg
  if (semantic === "surface") return "bg-surface";
  if (semantic === "on-surface") return "bg-on-surface";
  if (semantic === "primary") return "bg-primary";
  if (semantic === "accent") return "bg-accent";
  return "bg-secondary";
}

function hexToSemantic(hex: string, roleMap: RoleMap): Semantic | null {
  const n = normalizeHex(hex);
  if (n === roleMap.surface) return "surface";
  if (n === roleMap.onSurface) return "on-surface";
  if (n === roleMap.primary) return "primary";
  if (n === roleMap.accent) return "accent";
  return null;
}

export interface NormalizeResult {
  html: string;
  roleMap: RoleMap;
  replacements: number;
}

export function normalizeHexColors(html: string): NormalizeResult {
  const usages = collectUsages(html);
  if (usages.length === 0) {
    return { html, roleMap: {}, replacements: 0 };
  }

  const roleMap = assignRoles(usages);
  let out = html;
  let replacements = 0;

  // 1. Rewrite Tailwind arbitrary values
  out = out.replace(ARBITRARY_RE, (match, prefix: string, hexBody: string) => {
    const role: Role =
      prefix === "text" || prefix === "placeholder" || prefix === "caret" ? "text" :
      prefix === "border" || prefix === "outline" || prefix === "divide" || prefix === "ring" ? "border" :
      "bg";
    const semantic = hexToSemantic(`#${hexBody}`, roleMap);
    if (!semantic) return match;
    replacements += 1;
    return roleToSemantic(role, semantic);
  });

  // 2. Rewrite inline style properties — remove the property, append a class
  //    when possible. Inline styles on elements without class attr get a new
  //    class attr injected.
  out = out.replace(
    /style\s*=\s*("([^"]*)"|'([^']*)')/g,
    (full, _q, dq, sq) => {
      const styleContent = dq ?? sq ?? "";
      const classesToAdd: string[] = [];
      let newStyle = styleContent;

      newStyle = newStyle.replace(INLINE_STYLE_RE, (_m: string, prop: string, hex: string) => {
        const propLc = prop.toLowerCase();
        const role: Role = propLc.startsWith("color") ? "text"
          : propLc.startsWith("background") ? "bg"
          : "border";
        const semantic = hexToSemantic(hex, roleMap);
        if (!semantic) return `${prop}: ${hex}`;
        classesToAdd.push(roleToSemantic(role, semantic));
        replacements += 1;
        return ""; // remove this property
      });

      // Clean stray semicolons / whitespace
      newStyle = newStyle.replace(/;\s*;+/g, ";").replace(/^\s*;|;\s*$/g, "").trim();

      if (classesToAdd.length === 0) return full;

      const classAddon = classesToAdd.join(" ");
      // Tag the style attr with a marker so we can merge with existing class attr
      // in a second pass. Format: <<<EB_ADD:class list>>>
      const styleReplacement = newStyle
        ? `style="${newStyle}" data-eb-add="${classAddon}"`
        : `data-eb-add="${classAddon}"`;
      return styleReplacement;
    }
  );

  // 3. Merge data-eb-add markers into the element's class attribute.
  //    Pattern: the attr sits on the same element — find the containing tag.
  out = out.replace(
    /<([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)\sdata-eb-add="([^"]+)"([^>]*?)>/g,
    (_m, tag: string, before: string, addClasses: string, after: string) => {
      const rest = `${before}${after}`;
      const classMatch = rest.match(/\bclass\s*=\s*("([^"]*)"|'([^']*)')/);
      if (classMatch) {
        const existing = classMatch[2] ?? classMatch[3] ?? "";
        const merged = `${existing} ${addClasses}`.trim();
        const updated = rest.replace(
          /\bclass\s*=\s*("[^"]*"|'[^']*')/,
          `class="${merged}"`
        );
        return `<${tag}${updated}>`;
      }
      return `<${tag}${rest} class="${addClasses}">`;
    }
  );

  return { html: out, roleMap, replacements };
}
