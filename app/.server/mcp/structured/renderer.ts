/**
 * Renders a JSON-DSL template + data into a PDF Buffer using @react-pdf/renderer.
 *
 * The DSL is pure data (see ./types.ts) — no eval, no sandbox. Strings support
 * {{path}} interpolation and nodes can repeat with `each` or skip with `if`/`unless`.
 *
 * Brand kit support: templates may use semantic tokens like
 *   { style: { color: "primary", backgroundColor: "surface", fontFamily: "heading" } }
 * which the renderer resolves to concrete hex/font-name values from the passed
 * BrandKit before handing the style to React PDF. Templates that use hex
 * directly (`"#1a1a1a"`) or any other arbitrary value pass through unchanged.
 */
import React from "react";
import { Document, Page, View, Text, Image, Link, Font, renderToBuffer } from "@react-pdf/renderer";
import { getFontPath } from "./fonts";

// Register Twemoji as emoji source — Helvetica has no emoji glyphs and falls
// back to .notdef boxes that overlap the next character. Registering once at
// module load makes every {{interpolated}} emoji render as a PNG image.
Font.registerEmojiSource({
  format: "png",
  url: "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.0.3/assets/72x72/",
});
import type { DslNode, DslPage, DslTree } from "./types";

// ── Brand kit resolution ────────────────────────────────────────────────────

export interface RenderBrandKit {
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    surface?: string;
    extras?: Array<{ name: string; hex: string }>;
  };
  fonts?: {
    heading?: string;
    body?: string;
  };
  logoUrl?: string;
}

export interface RenderCtx {
  brandKit?: RenderBrandKit | null;
}

const COLOR_TOKENS = new Set([
  "primary", "secondary", "accent", "surface",
  "on-primary", "on-secondary", "on-accent", "on-surface", "on-surface-muted",
]);
const FONT_TOKENS = new Set(["heading", "body"]);

/** Return black or white depending on perceived luminance of a hex bg. */
function onColor(hex: string): string {
  const h = hex.replace(/^#/, "");
  if (h.length !== 3 && h.length !== 6) return "#1a1a1a";
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // Relative luminance per WCAG, simplified.
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return l > 0.55 ? "#1a1a1a" : "#ffffff";
}

/** Mix a hex with white or black by the given factor (0..1). */
function mix(hex: string, towardsLight: boolean, factor: number): string {
  const h = hex.replace(/^#/, "");
  if (h.length !== 3 && h.length !== 6) return hex;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const target = towardsLight ? 255 : 0;
  const nr = Math.round(r + (target - r) * factor);
  const ng = Math.round(g + (target - g) * factor);
  const nb = Math.round(b + (target - b) * factor);
  return "#" + [nr, ng, nb].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function buildColorMap(kit: RenderBrandKit | null | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  if (!kit?.colors) return map;
  const c = kit.colors;
  if (c.primary) map["primary"] = c.primary;
  if (c.secondary) map["secondary"] = c.secondary;
  if (c.accent) map["accent"] = c.accent;
  if (c.surface) map["surface"] = c.surface;
  if (c.primary) map["on-primary"] = onColor(c.primary);
  if (c.secondary) map["on-secondary"] = onColor(c.secondary);
  if (c.accent) map["on-accent"] = onColor(c.accent);
  if (c.surface) {
    const onSurface = onColor(c.surface);
    map["on-surface"] = onSurface;
    // Muted: 45% toward the opposite extreme from on-surface.
    map["on-surface-muted"] = mix(onSurface, onSurface === "#ffffff" ? false : true, 0.45);
  }
  // Named extras (e.g. { name: "success", hex: "#22c55e" })
  for (const extra of c.extras ?? []) {
    if (extra?.name && extra?.hex) map[extra.name] = extra.hex;
  }
  return map;
}

function buildFontMap(kit: RenderBrandKit | null | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  if (!kit?.fonts) return map;
  if (kit.fonts.heading) map["heading"] = kit.fonts.heading;
  if (kit.fonts.body) map["body"] = kit.fonts.body;
  return map;
}

const COLOR_STYLE_KEYS = new Set(["color", "backgroundColor", "borderColor", "borderTopColor", "borderBottomColor", "borderLeftColor", "borderRightColor"]);

/** Return a new style with token strings replaced by concrete values. */
function resolveStyle(style: any, colorMap: Record<string, string>, fontMap: Record<string, string>): any {
  if (!style || typeof style !== "object") return style;
  const out: any = {};
  for (const [k, v] of Object.entries(style)) {
    if (typeof v === "string") {
      if (COLOR_STYLE_KEYS.has(k) && COLOR_TOKENS.has(v) && colorMap[v]) {
        out[k] = colorMap[v];
        continue;
      }
      if (k === "fontFamily" && FONT_TOKENS.has(v) && fontMap[v]) {
        out[k] = fontMap[v];
        continue;
      }
    }
    out[k] = v;
  }
  return out;
}

// ── Font registration ───────────────────────────────────────────────────────

const registeredFonts = new Set<string>();

async function registerKitFonts(kit: RenderBrandKit | null | undefined): Promise<void> {
  if (!kit?.fonts) return;
  const families = [kit.fonts.heading, kit.fonts.body].filter(Boolean) as string[];
  const uniq = Array.from(new Set(families));
  await Promise.all(
    uniq.map(async (family) => {
      if (registeredFonts.has(family)) return;
      const regular = await getFontPath(family, 400);
      if (!regular) return; // let PDF fall back to default silently
      const bold = await getFontPath(family, 700);
      try {
        Font.register({
          family,
          fonts: bold
            ? [{ src: regular, fontWeight: 400 }, { src: bold, fontWeight: 700 }]
            : [{ src: regular, fontWeight: 400 }],
        });
        registeredFonts.add(family);
      } catch {
        // If registration fails, don't mark as registered so we retry later.
      }
    })
  );
}

// ── Placeholder / tree walk ─────────────────────────────────────────────────

/** Walk a dotted path (supports "." for current item). Returns undefined if missing. */
function resolvePath(path: string, ctx: any, item: any): any {
  if (!path) return undefined;
  const trimmed = path.trim();
  if (trimmed === "." || trimmed === "item") return item;
  const parts = trimmed.startsWith("item.") ? trimmed.slice(5).split(".") : trimmed.startsWith(".") ? trimmed.slice(1).split(".") : trimmed.split(".");
  let target = trimmed.startsWith("item") || trimmed.startsWith(".") ? item : ctx;
  for (const p of parts) {
    if (target == null) return undefined;
    target = target[p];
  }
  return target;
}

/** Replace {{path}} occurrences in a string with resolved data. */
function interpolate(s: string, ctx: any, item: any): string {
  return s.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, path) => {
    const v = resolvePath(path, ctx, item);
    return v == null ? "" : String(v);
  });
}

function shouldRender(node: DslNode, ctx: any, item: any): boolean {
  if ("if" in node && node.if && !resolvePath(node.if, ctx, item)) return false;
  if ("unless" in node && node.unless && resolvePath(node.unless, ctx, item)) return false;
  return true;
}

interface RenderEnv {
  colorMap: Record<string, string>;
  fontMap: Record<string, string>;
}

/** Expand a single node — may produce 0, 1, or N elements (if `each`). */
function renderNode(node: DslNode, ctx: any, item: any, key: string, env: RenderEnv): React.ReactNode {
  if (!shouldRender(node, ctx, item)) return null;

  // `each` repeats this node per array element.
  if ("each" in node && node.each) {
    const list = resolvePath(node.each, ctx, item);
    if (!Array.isArray(list)) return null;
    const { each, ...rest } = node as any;
    return list.map((row, i) => renderNode(rest as DslNode, ctx, row, `${key}-${i}`, env));
  }

  const style = resolveStyle(node.style, env.colorMap, env.fontMap);

  switch (node.type) {
    case "Text":
      return React.createElement(Text, { key, style }, interpolate(node.content, ctx, item));
    case "View":
      return React.createElement(
        View,
        { key, style },
        (node.children ?? []).map((child, i) => renderNode(child, ctx, item, `${key}-${i}`, env))
      );
    case "Image": {
      const src = interpolate(node.src, ctx, item);
      // Skip Image nodes with empty src — common when {{__logo}} is used but
      // the user has no logo set. Rendering with empty src throws in React PDF.
      if (!src) return null;
      return React.createElement(Image, { key, src, style });
    }
    case "Link":
      return React.createElement(
        Link,
        { key, src: interpolate(node.src, ctx, item), style },
        interpolate(node.content, ctx, item)
      );
  }
}

function renderPage(page: DslPage, ctx: any, defaultStyle: any, key: string, env: RenderEnv): React.ReactElement {
  return React.createElement(
    Page,
    {
      key,
      size: page.size ?? "LETTER",
      orientation: page.orientation ?? "portrait",
      style: { ...(resolveStyle(defaultStyle, env.colorMap, env.fontMap) ?? {}), ...(resolveStyle(page.style, env.colorMap, env.fontMap) ?? {}) } as any,
    },
    page.children.map((child, i) => renderNode(child, ctx, undefined, `${key}-n${i}`, env))
  );
}

/**
 * Walk a DSL tree and collect every top-level `{{key}}` placeholder referenced
 * in `content` / `src` string fields. Used by `create_doc` validation to flag
 * unbound placeholders and dead data keys before the agent silently ships a
 * broken PDF.
 *
 * Only returns the FIRST segment of dotted paths (e.g. `{{cliente.nombre}}` →
 * `cliente`) because the data object is validated at top-level.
 * Placeholders starting with `__` (e.g. `__logo`) are reserved for renderer
 * injection and excluded from validation.
 */
export function collectTreePlaceholders(tree: DslTree): Set<string> {
  const found = new Set<string>();
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  const addFromString = (s: string) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      const path = m[1].trim();
      if (!path || path === "." || path === "item") continue;
      const first = path.startsWith("item.") ? path.slice(5).split(".")[0] : path.split(".")[0];
      if (first && !first.startsWith("__")) found.add(first);
    }
  };
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.content === "string") addFromString(node.content);
    if (typeof node.src === "string") addFromString(node.src);
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  for (const page of tree.pages) (page.children ?? []).forEach(visit);
  return found;
}

export async function renderDslToPdf(tree: DslTree, data: Record<string, any>, ctx?: RenderCtx): Promise<Buffer> {
  const kit = ctx?.brandKit ?? null;
  await registerKitFonts(kit);

  const env: RenderEnv = {
    colorMap: buildColorMap(kit),
    fontMap: buildFontMap(kit),
  };

  // Reserved renderer-injected keys (prefix __) — available to templates via
  // {{__logo}} etc. User data never uses these names (we strip them at validation).
  const ctxData = { ...data, __logo: kit?.logoUrl ?? "" };

  const doc = React.createElement(
    Document,
    null,
    tree.pages.map((p, i) => renderPage(p, ctxData, tree.defaultPageStyle, `p${i}`, env))
  );
  // @react-pdf/renderer returns a Node Buffer here.
  return (await renderToBuffer(doc as any)) as Buffer;
}
