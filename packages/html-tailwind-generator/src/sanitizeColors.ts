/**
 * Replace hardcoded Tailwind color classes with semantic color classes.
 *
 * Four layers:
 * 1. Neutral bg replacements: bg-white → bg-surface, bg-gray-900 → bg-primary-dark, etc.
 * 2. Chromatic replacements: bg-blue-500 → bg-secondary, bg-green-500 → bg-accent, etc.
 *    (only if the AI didn't already use semantic classes)
 * 3. Arbitrary-value replacements: bg-[#9a99ea] → bg-primary (mapped by RGB
 *    distance to the active theme palette, or HSL hue bucketing as fallback).
 * 4. Ancestor-aware text-color pass: walks the DOM with a stack of effective
 *    background family (primary | secondary | accent | surface) and rewrites
 *    every text-* that conflicts with its ancestor bg. This fixes "black-on-black"
 *    and "text-on-primary on bg-surface" invisible-text bugs regardless of theme.
 */

const COLORS =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const SECONDARY_COLORS = "blue|indigo|violet";
const ACCENT_COLORS = "green|emerald|teal|cyan";

function categorize(color: string): "primary" | "secondary" | "accent" {
  if (new RegExp(`^(?:${SECONDARY_COLORS})$`).test(color)) return "secondary";
  if (new RegExp(`^(?:${ACCENT_COLORS})$`).test(color)) return "accent";
  return "primary";
}

// ── Arbitrary-value helpers (Tailwind JIT: text-[#hex], bg-[#hex], etc.) ──

type Role = "primary" | "secondary" | "accent" | "surface";
type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6); // drop alpha
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbDist(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/** HSL hue bucketing fallback when no theme palette is available. */
function hueBucket(rgb: Rgb): Exclude<Role, "surface"> {
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min;
  const lum = (max + min) / 2;
  if (delta < 0.04) {
    // grayscale → treat as primary surface tone (caller decides bg vs surface elsewhere)
    return "primary";
  }
  let h = 0;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  // very dark or very light → primary fallback
  if (lum < 0.08 || lum > 0.96) return "primary";
  if (h < 50 || h >= 285) return "primary"; // red → amber, purple → rose
  if (h < 200) return "accent"; // yellow → cyan (greens, teals)
  return "secondary"; // sky → violet
}

/** Map an arbitrary hex to a semantic role using theme palette (RGB nearest)
 *  or HSL hue bucketing fallback. Used to rewrite arbitrary-value classes. */
function hexToRole(hex: string, themeColors?: Record<string, string>): Role {
  const target = parseHex(hex);
  if (!target) return "primary";

  if (themeColors) {
    const candidates: Array<[Role, Rgb]> = [];
    for (const role of ["primary", "secondary", "accent", "surface"] as Role[]) {
      const v = themeColors[role];
      const rgb = v ? parseHex(v) : null;
      if (rgb) candidates.push([role, rgb]);
    }
    if (candidates.length > 0) {
      let best: Role = candidates[0][0];
      let bestDist = rgbDist(target, candidates[0][1]);
      for (let i = 1; i < candidates.length; i++) {
        const d = rgbDist(target, candidates[i][1]);
        if (d < bestDist) { bestDist = d; best = candidates[i][0]; }
      }
      return best;
    }
  }
  return hueBucket(target);
}

/** All Tailwind utilities that accept a chromatic arbitrary value and that
 *  we map to a *non-text* semantic class (the role itself, not text-on-X). */
const BG_LIKE_UTILS = [
  "bg", "border", "ring", "from", "to", "via",
  "shadow", "decoration", "outline", "divide", "accent", "placeholder",
];

// ── Neutral bg replacements (text rewrites moved to ancestor-aware walker) ──
const NEUTRALS = "slate|gray|zinc|neutral|stone";

const neutralReplacements: [RegExp, string][] = [
  // bg-white → bg-surface
  [/\bbg-white\b/g, "bg-surface"],
  // bg-black → bg-primary-dark
  [/\bbg-black\b/g, "bg-primary-dark"],

  // bg-gray-50/100 → bg-surface
  [new RegExp(`\\bbg-(${NEUTRALS})-(50|100)\\b`, "g"), "bg-surface"],
  // bg-gray-200/300 → bg-surface-alt
  [new RegExp(`\\bbg-(${NEUTRALS})-(200|300)\\b`, "g"), "bg-surface-alt"],
  // bg-gray-400-600 → bg-primary
  [new RegExp(`\\bbg-(${NEUTRALS})-(400|500|600)\\b`, "g"), "bg-primary"],
  // bg-gray-700-950 → bg-primary-dark
  [new RegExp(`\\bbg-(${NEUTRALS})-(700|800|900|950)\\b`, "g"), "bg-primary-dark"],

  // hover:bg neutrals
  [new RegExp(`\\bhover:bg-(${NEUTRALS})-(50|100|200|300)\\b`, "g"), "hover:bg-surface-alt"],
  [new RegExp(`\\bhover:bg-(${NEUTRALS})-(400|500|600|700|800|900|950)\\b`, "g"), "hover:bg-primary-dark"],
];

// Hardcoded text colors get a SEEDED rewrite to text-on-surface (the default fallback).
// The ancestor-aware walker will then re-target them to the correct on-X variant.
const textSeedReplacements: [RegExp, string][] = [
  [/\btext-white\b/g, "text-on-surface-LIGHT"], // marker: "was light text"
  [/\btext-black\b/g, "text-on-surface-DARK"], // marker: "was dark text"
  [new RegExp(`\\btext-(${NEUTRALS})-(50|100|200)\\b`, "g"), "text-on-surface-LIGHT"],
  [new RegExp(`\\btext-(${NEUTRALS})-(300|400|500|600)\\b`, "g"), "text-on-surface-MUTED"],
  [new RegExp(`\\btext-(${NEUTRALS})-(700|800|900|950)\\b`, "g"), "text-on-surface-DARK"],
  [new RegExp(`\\bhover:text-(${NEUTRALS})-\\d{2,3}\\b`, "g"), "hover:text-on-surface"],
];

// ── Chromatic replacements ──
function buildChromaticReplacements(): [RegExp, (match: string, color: string) => string][] {
  const re = (prefix: string, shades: string) =>
    new RegExp(`\\b${prefix}-(${COLORS})-(${shades})\\b`, "g");

  return [
    // Background
    [re("bg", "500|600|700"), (_m, c) => `bg-${categorize(c)}`],
    [re("bg", "50|100"), (_m, c) => `bg-${categorize(c)}-light`],
    [re("bg", "800|900|950"), (_m, c) => `bg-${categorize(c)}-dark`],
    [re("bg", "200|300|400"), (_m, c) => `bg-${categorize(c)}`],

    // Text
    [re("text", "500|600|700"), (_m, c) => `text-${categorize(c)}`],
    [re("text", "800|900|950"), (_m, c) => `text-${categorize(c)}-dark`],
    [re("text", "50|100|200|300"), (_m, c) => `text-on-${categorize(c)}`],
    [re("text", "400"), (_m, c) => `text-${categorize(c)}`],

    // Border
    [re("border", "\\d{2,3}"), (_m, c) => `border-${categorize(c)}`],

    // Ring
    [re("ring", "\\d{2,3}"), (_m, c) => `ring-${categorize(c)}`],

    // Gradients
    [re("from", "\\d{2,3}"), (_m, c) => `from-${categorize(c)}`],
    [re("to", "\\d{2,3}"), (_m, c) => `to-${categorize(c)}`],
    [re("via", "\\d{2,3}"), (_m, c) => `via-${categorize(c)}`],

    // Hover/focus variants
    [new RegExp(`\\bhover:bg-(${COLORS})-(500|600|700|800|900|950)\\b`, "g"), (_m, c) => `hover:bg-${categorize(c)}-dark`],
    [new RegExp(`\\bhover:bg-(${COLORS})-(50|100|200|300|400)\\b`, "g"), (_m, c) => `hover:bg-${categorize(c)}-light`],
    [new RegExp(`\\bhover:text-(${COLORS})-\\d{2,3}\\b`, "g"), (_m, c) => `hover:text-${categorize(c)}`],
    [new RegExp(`\\bfocus:ring-(${COLORS})-\\d{2,3}\\b`, "g"), (_m, c) => `focus:ring-${categorize(c)}`],
    [new RegExp(`\\bfocus:border-(${COLORS})-\\d{2,3}\\b`, "g"), (_m, c) => `focus:border-${categorize(c)}`],

    // Divide
    [re("divide", "\\d{2,3}"), (_m, c) => `divide-${categorize(c)}`],

    // Placeholder
    [re("placeholder", "\\d{2,3}"), (_m, c) => `placeholder-${categorize(c)}`],

    // Outline
    [re("outline", "\\d{2,3}"), (_m, c) => `outline-${categorize(c)}`],

    // Shadow colored
    [re("shadow", "\\d{2,3}"), (_m, c) => `shadow-${categorize(c)}`],

    // Decoration
    [re("decoration", "\\d{2,3}"), (_m, c) => `decoration-${categorize(c)}`],

    // Accent (form accent color)
    [re("accent", "\\d{2,3}"), (_m, c) => `accent-${categorize(c)}`],
  ];
}

const chromaticReplacements = buildChromaticReplacements();

// ==================== ANCESTOR-AWARE WALKER ====================

type BgFamily = "primary" | "secondary" | "accent" | "surface" | "surface-deep" | null;

const VOID_TAGS = new Set([
  "br", "hr", "img", "input", "meta", "link", "area", "base", "col",
  "embed", "source", "track", "wbr",
]);

/** Parse a class string and determine the effective bg family (ignoring state variants like hover:).
 *  Returns null for low-opacity tints (< 50%) — those are overlays that pass the ancestor bg through,
 *  so the text color should be decided against the real ancestor, not the tint.
 */
function detectBgFamily(classStr: string): BgFamily {
  const tokens = classStr.split(/\s+/).filter((c) => c && !c.includes(":"));
  // Last-wins: if an element has multiple bg classes, the rightmost one should reflect intent.
  let found: BgFamily = null;
  for (const t of tokens) {
    // Extract opacity suffix if present (e.g. "/10", "/50") and ignore anything below 50 —
    // those look through to the ancestor bg and should NOT be treated as a solid background.
    const opMatch = t.match(/\/(\d{1,3})$/);
    if (opMatch) {
      const op = parseInt(opMatch[1], 10);
      if (op < 50) continue;
    }
    if (/^bg-primary(?:-light|-dark)?(?:\/\d+)?$/.test(t)) found = "primary";
    else if (/^bg-secondary(?:\/\d+)?$/.test(t)) found = "secondary";
    else if (/^bg-accent(?:\/\d+)?$/.test(t)) found = "accent";
    else if (/^bg-surface-deep(?:\/\d+)?$/.test(t)) found = "surface-deep";
    else if (/^bg-surface(?:-alt)?(?:\/\d+)?$/.test(t)) found = "surface";
  }
  if (found) return found;
  // Gradient: infer from from-X stop (only when bg-gradient is present)
  if (tokens.some((t) => /^bg-gradient-/.test(t))) {
    for (const t of tokens) {
      const m = t.match(/^from-(primary|secondary|accent|surface)(?:-light|-dark|-alt)?(?:\/\d+)?$/);
      if (m) return m[1] as BgFamily;
    }
  }
  return null;
}

/** Walk the stack bottom-to-top to find the nearest defined bg family; default to surface. */
function effectiveBg(stack: BgFamily[]): Exclude<BgFamily, null> {
  for (let i = stack.length - 1; i >= 0; i--) {
    const v = stack[i];
    if (v !== null) return v;
  }
  return "surface";
}

function onClass(bg: Exclude<BgFamily, null>): string {
  return `text-on-${bg}`;
}

function onMutedClass(bg: Exclude<BgFamily, null>): string {
  if (bg === "surface") return "text-on-surface-muted";
  if (bg === "surface-deep") return "text-on-surface-deep";
  return `text-on-${bg}`;
}

/** Rewrite text-* classes inside a single element's class string based on its effective bg. */
function fixTextClassesForBg(classStr: string, bg: Exclude<BgFamily, null>): string {
  let s = classStr;
  const on = onClass(bg);
  const onMuted = onMutedClass(bg);

  // Seeded markers from pass 1 → resolve to correct on-X for this ancestor
  s = s.replace(/\btext-on-surface-LIGHT\b/g, on);
  s = s.replace(/\btext-on-surface-DARK\b/g, on);
  s = s.replace(/\btext-on-surface-MUTED\b/g, onMuted);

  // Re-target mis-assigned on-X classes (e.g. text-on-primary inside bg-surface)
  if (bg === "primary") {
    s = s.replace(/\btext-on-surface(?:-muted)?\b/g, "text-on-primary");
    s = s.replace(/\btext-on-secondary\b/g, "text-on-primary");
    s = s.replace(/\btext-on-accent\b/g, "text-on-primary");
    // text-primary on bg-primary is INVISIBLE (same hue) — rewrite to on-primary
    s = s.replace(/\btext-primary(?!-(?:light|dark))\b/g, "text-on-primary");
  } else if (bg === "secondary") {
    s = s.replace(/\btext-on-surface(?:-muted)?\b/g, "text-on-secondary");
    s = s.replace(/\btext-on-primary\b/g, "text-on-secondary");
    s = s.replace(/\btext-on-accent\b/g, "text-on-secondary");
    s = s.replace(/\btext-secondary\b/g, "text-on-secondary");
  } else if (bg === "accent") {
    s = s.replace(/\btext-on-surface(?:-muted)?\b/g, "text-on-accent");
    s = s.replace(/\btext-on-primary\b/g, "text-on-accent");
    s = s.replace(/\btext-on-secondary\b/g, "text-on-accent");
    s = s.replace(/\btext-accent\b/g, "text-on-accent");
  } else if (bg === "surface-deep") {
    // bg-surface-deep is a dark contrast surface — text must be light.
    // text-on-surface (dark) on bg-surface-deep is invisible. Rewrite all
    // light-text variants → text-on-surface-deep.
    s = s.replace(/\btext-on-surface(?!-deep)(?:-muted)?\b/g, "text-on-surface-deep");
    s = s.replace(/\btext-on-primary\b/g, "text-on-surface-deep");
    s = s.replace(/\btext-on-secondary\b/g, "text-on-surface-deep");
    s = s.replace(/\btext-on-accent\b/g, "text-on-surface-deep");
  } else {
    // bg === "surface" — text-on-primary/secondary/accent likely invisible on surface
    s = s.replace(/\btext-on-primary\b/g, "text-on-surface");
    s = s.replace(/\btext-on-secondary\b/g, "text-on-surface");
    s = s.replace(/\btext-on-accent\b/g, "text-on-surface");
  }

  return s;
}

/** Ancestor-aware pass: walk HTML, maintain bg stack, rewrite text-* per element. */
function ancestorAwareTextPass(html: string): string {
  try {
    const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(\/?)>/g;
    const stack: BgFamily[] = [];
    let out = "";
    let lastIdx = 0;
    let m: RegExpExecArray | null;

    while ((m = tagRe.exec(html)) !== null) {
      const [full, slash, tagName, attrs, selfCloseSlash] = m;
      out += html.slice(lastIdx, m.index);
      lastIdx = m.index + full.length;

      if (slash === "/") {
        // Closing tag
        stack.pop();
        out += full;
        continue;
      }

      // Opening (or self-closing) tag
      const classMatch = attrs.match(/\bclass="([^"]*)"/);
      const ownBg = classMatch ? detectBgFamily(classMatch[1]) : null;
      const effective: Exclude<BgFamily, null> = ownBg ?? effectiveBg(stack);

      let newAttrs = attrs;
      if (classMatch) {
        const fixed = fixTextClassesForBg(classMatch[1], effective);
        if (fixed !== classMatch[1]) {
          newAttrs = attrs.replace(/\bclass="[^"]*"/, `class="${fixed}"`);
        }
      }
      out += `<${tagName}${newAttrs}${selfCloseSlash}>`;

      const isVoid = VOID_TAGS.has(tagName.toLowerCase()) || selfCloseSlash === "/";
      if (!isVoid) stack.push(ownBg);
    }
    out += html.slice(lastIdx);

    // Clean up any remaining markers that slipped through (e.g. in malformed fragments)
    out = out
      .replace(/\btext-on-surface-LIGHT\b/g, "text-on-surface")
      .replace(/\btext-on-surface-DARK\b/g, "text-on-surface")
      .replace(/\btext-on-surface-MUTED\b/g, "text-on-surface-muted");

    return out;
  } catch {
    // Defensive: if tokenizer trips on weird HTML, return input with markers stripped.
    return html
      .replace(/\btext-on-surface-LIGHT\b/g, "text-on-surface")
      .replace(/\btext-on-surface-DARK\b/g, "text-on-surface")
      .replace(/\btext-on-surface-MUTED\b/g, "text-on-surface-muted");
  }
}

/** Strip Tailwind JIT arbitrary-value chromatic classes (bg-[#hex], text-[#hex],
 *  from-[#hex], etc.) and replace with semantic classes. Models like Gemini often
 *  emit these because Tailwind JIT accepts them — they bypass the entire token
 *  system and break brandkit/theme swaps. */
function arbitraryValueReplacements(html: string, themeColors?: Record<string, string>): string {
  let s = html;

  // bg-like utilities (incl. hover:/focus:/group-hover:/etc. variants), with optional /opacity suffix.
  // Leading (?<![A-Za-z0-9_-]) anchors at a class boundary; trailing (?![A-Za-z0-9_-]) prevents
  // matching into adjacent tokens. \b doesn't work here because [ and ] are non-word chars.
  const bgUtilGroup = BG_LIKE_UTILS.join("|");
  const bgPattern = new RegExp(
    `(?<![A-Za-z0-9_-])((?:[a-z-]+:)*)(${bgUtilGroup})-\\[#([0-9a-fA-F]{3,8})\\](\\/\\d{1,3})?(?![A-Za-z0-9_-])`,
    "g"
  );
  s = s.replace(bgPattern, (_m, variants: string, util: string, hex: string, opacity: string | undefined) => {
    const role = hexToRole(hex, themeColors);
    const op = opacity || "";
    return `${variants}${util}-${role}${op}`;
  });

  // text-[#hex] → seed marker. Walker resolves to text-on-X based on ancestor bg.
  const textPattern = /(?<![A-Za-z0-9_-])((?:[a-z-]+:)*)text-\[#([0-9a-fA-F]{3,8})\](\/\d{1,3})?(?![A-Za-z0-9_-])/g;
  s = s.replace(textPattern, (_m, variants: string) => {
    // Seed as MUTED — most arbitrary text colors are body copy. Walker upgrades on dark bg.
    return `${variants}text-on-surface-MUTED`;
  });

  return s;
}

export function sanitizeSemanticColors(
  html: string,
  themeColors?: Record<string, string>
): string {
  let result = html;

  // 1. Replace neutral bg classes (bg-white, bg-gray-*, etc.)
  for (const [pattern, replacement] of neutralReplacements) {
    result = result.replace(pattern, replacement);
  }

  // 2. Seed hardcoded text colors with markers that the walker will resolve per ancestor.
  for (const [pattern, replacement] of textSeedReplacements) {
    result = result.replace(pattern, replacement);
  }

  // 3. Strip arbitrary chromatic values (bg-[#hex], text-[#hex], from-[#hex], etc.)
  //    Done BEFORE chromatic sanitization so the "hasSemanticClasses" probe sees the
  //    rewritten classes too.
  result = arbitraryValueReplacements(result, themeColors);

  // 4. Skip chromatic sanitization if the AI already used semantic classes.
  const hasSemanticClasses = /\b(?:bg-primary|bg-secondary|bg-accent|bg-surface)\b/.test(result);
  if (!hasSemanticClasses) {
    for (const [pattern, replacer] of chromaticReplacements) {
      result = result.replace(pattern, replacer as any);
    }
  }

  // 5. Ancestor-aware pass: resolve seed markers and fix mis-matched text-on-X classes.
  result = ancestorAwareTextPass(result);

  return result;
}
