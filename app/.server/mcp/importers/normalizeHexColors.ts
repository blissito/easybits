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

// <style> blocks — for the CSS-class-rule extraction pass.
const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;

// A selector is "simple" if it's a single class or a comma-separated list of classes
// with no pseudo, descendant, attribute, or compound specifiers.
const SIMPLE_CLASS_RE = /^\s*(\.[a-zA-Z_][\w-]*(?:\s*,\s*\.[a-zA-Z_][\w-]*)*)\s*$/;

const COLOR_PROPS = new Set([
  "color",
  "background",
  "background-color",
  "border-color",
  "fill",
  "stroke",
]);

function propToRole(prop: string): Role {
  const p = prop.toLowerCase();
  if (p === "color") return "text";
  if (p.startsWith("background") || p === "fill") return "bg";
  return "border";
}

// Split a declaration body by top-level `;`, respecting parentheses so `rgb(1, 2, 3)` stays whole.
function splitDeclarations(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === ";" && depth === 0) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current);
  return out;
}

/**
 * Walk top-level rules in a CSS string. Calls `visitSimple(classNames, declarations)`
 * for each rule whose selector is a simple class list, and `visitOther(raw)` for
 * at-rules / complex-selector rules the caller should preserve verbatim. Comments
 * and whitespace are passed through `visitOther` unchanged.
 */
function walkCssTopLevel(
  css: string,
  visitSimple: (classNames: string[], selector: string, body: string) => { keptBody: string },
  visitOther: (raw: string) => void,
): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    // Whitespace → pass through.
    if (/\s/.test(css[i])) { out += css[i]; i++; continue; }
    // CSS comment → pass through.
    if (css[i] === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      const stop = end === -1 ? css.length : end + 2;
      out += css.slice(i, stop);
      i = stop;
      continue;
    }

    const braceStart = css.indexOf("{", i);
    if (braceStart === -1) {
      out += css.slice(i);
      break;
    }

    // Track matching brace for the rule's body (handles nested rules inside @media).
    let depth = 1;
    let j = braceStart + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      if (depth === 0) break;
      j++;
    }
    const bodyEnd = j;
    const rawSelector = css.slice(i, braceStart);
    const selectorTrim = rawSelector.trim();
    const body = css.slice(braceStart + 1, bodyEnd);
    const raw = css.slice(i, bodyEnd + 1);

    if (selectorTrim.startsWith("@")) {
      visitOther(raw);
      out += raw;
      i = bodyEnd + 1;
      continue;
    }

    const m = selectorTrim.match(SIMPLE_CLASS_RE);
    if (!m) {
      visitOther(raw);
      out += raw;
      i = bodyEnd + 1;
      continue;
    }

    const classNames = m[1].split(",").map(s => s.trim().replace(/^\./, ""));
    const { keptBody } = visitSimple(classNames, rawSelector, body);
    if (keptBody.trim()) {
      out += rawSelector + "{" + keptBody + "}";
    }
    // else: rule collapsed, drop it entirely.
    i = bodyEnd + 1;
  }
  return out;
}

function extractHexFromValue(value: string): string | null {
  const m = value.trim().match(/^(#[0-9a-fA-F]{3,8})(\s+!important)?$/);
  return m ? m[1] : null;
}

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

  // <style> class-rule declarations
  for (const m of html.matchAll(STYLE_BLOCK_RE)) {
    const cssText = m[1];
    walkCssTopLevel(
      cssText,
      (_classNames, _selector, body) => {
        for (const decl of splitDeclarations(body)) {
          const colonIdx = decl.indexOf(":");
          if (colonIdx === -1) continue;
          const prop = decl.slice(0, colonIdx).trim().toLowerCase();
          if (!COLOR_PROPS.has(prop)) continue;
          const hex = extractHexFromValue(decl.slice(colonIdx + 1));
          if (!hex) continue;
          bump(propToRole(prop), hex);
        }
        return { keptBody: body };
      },
      () => {},
    );
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

/**
 * Rewrite simple class-selector CSS rules in `<style>` blocks: strip hex color
 * declarations and append equivalent Tailwind classes to every element carrying
 * the class. Complex selectors, pseudo-classes, at-rules, and non-color
 * declarations are left untouched.
 *
 * Unmapped hexes (no role match) fall back to Tailwind arbitrary values
 * (`text-[#abcdef]`) so the output stays 100% class-driven.
 */
function rewriteStyleBlocks(html: string, roleMap: RoleMap): { html: string; replacements: number } {
  let replacements = 0;
  // className → Set of Tailwind classes to append.
  const additions = new Map<string, Set<string>>();

  const out = html.replace(STYLE_BLOCK_RE, (fullTag, cssText) => {
    const newCss = walkCssTopLevel(
      cssText,
      (classNames, _selector, body) => {
        const kept: string[] = [];
        for (const decl of splitDeclarations(body)) {
          const colonIdx = decl.indexOf(":");
          if (colonIdx === -1) { kept.push(decl); continue; }
          const prop = decl.slice(0, colonIdx).trim().toLowerCase();
          const valueRaw = decl.slice(colonIdx + 1);
          if (!COLOR_PROPS.has(prop)) { kept.push(decl); continue; }
          const hex = extractHexFromValue(valueRaw);
          if (!hex) { kept.push(decl); continue; }
          // Convert to Tailwind class (semantic if mapped, arbitrary otherwise).
          const role = propToRole(prop);
          const semantic = hexToSemantic(hex, roleMap);
          const tw = semantic
            ? roleToSemantic(role, semantic)
            : `${role}-[${normalizeHex(hex)}]`;
          for (const cn of classNames) {
            if (!additions.has(cn)) additions.set(cn, new Set());
            additions.get(cn)!.add(tw);
          }
          replacements += 1;
          // Decl is dropped from the rule.
        }
        return { keptBody: kept.join(";") };
      },
      () => {},
    );

    // Strip the tag if the block ends up empty (whitespace only).
    if (!newCss.trim()) return "";
    // Preserve the original <style ...> opening so attributes survive.
    return fullTag.replace(/<style([^>]*)>[\s\S]*?<\/style>/i, `<style$1>${newCss}</style>`);
  });

  if (additions.size === 0) return { html: out, replacements };

  // Append classes to every matching element. Whole-word class match.
  const classAttrRe = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/g;
  const finalHtml = out.replace(classAttrRe, (full: string, _q: string, dq: string | undefined, sq: string | undefined) => {
    const current = dq ?? sq ?? "";
    const present = new Set<string>(current.split(/\s+/).filter(Boolean));
    const toAdd: string[] = [];
    for (const className of present) {
      const extras = additions.get(className);
      if (!extras) continue;
      for (const extra of extras) {
        if (!present.has(extra)) toAdd.push(extra);
      }
    }
    if (toAdd.length === 0) return full;
    const merged = [...present, ...toAdd].join(" ");
    return `class="${merged}"`;
  });

  return { html: finalHtml, replacements };
}

export function normalizeHexColors(html: string): NormalizeResult {
  const usages = collectUsages(html);
  if (usages.length === 0) {
    return { html, roleMap: {}, replacements: 0 };
  }

  const roleMap = assignRoles(usages);
  let out = html;
  let replacements = 0;

  // 0. Rewrite simple class rules in <style> blocks → inject Tailwind classes on elements.
  const styleResult = rewriteStyleBlocks(out, roleMap);
  out = styleResult.html;
  replacements += styleResult.replacements;

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
