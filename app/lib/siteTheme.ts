/**
 * Tema de un sitio de /dash/sitios: colores como tokens `--color-*` (las llaves de
 * `LandingTheme.colors`). El archivo de tema DENTRO del sitio es la fuente de verdad:
 * - web app (Tailwind 4): `eb-theme.css` con `@theme { … }`, importado por el CSS principal.
 * - estático (Tailwind 3 CDN): bloque `<style id="eb-theme">` + `<script id="eb-theme-tw">` en el head.
 * El botón «Tema» lo reescribe sin modelo; la vista previa lo aplica en vivo (eb-picker.js).
 */
import { LANDING_THEMES } from "~/lib/landing3/themes";
import { COMMUNITY_THEMES } from "~/lib/landing3/communityThemes";

export type ThemeColors = Record<string, string>;

export const THEME_TOKENS = Object.keys(LANDING_THEMES[0].colors);
export const SITE_THEMES = [...LANDING_THEMES.filter((t) => t.id !== "custom"), ...COMMUNITY_THEMES];
export const DEFAULT_SITE_THEME = SITE_THEMES[0];

const HEX = /^#[0-9a-f]{6}$/i;

/** Colores completos y válidos, o null. Sólo tokens conocidos, todos presentes. */
export function validThemeColors(colors: unknown): ThemeColors | null {
  if (!colors || typeof colors !== "object") return null;
  const c = colors as Record<string, unknown>;
  const out: ThemeColors = {};
  for (const k of THEME_TOKENS) {
    const v = c[k];
    if (typeof v !== "string" || !HEX.test(v)) return null;
    out[k] = v.toLowerCase();
  }
  return out;
}

const vars = (colors: ThemeColors, indent = "  ") => THEME_TOKENS.map((k) => `${indent}--color-${k}: ${colors[k]};`).join("\n");

/** `eb-theme.css` de una web app con Tailwind 4: genera `bg-primary`, `text-on-surface`, … */
export function themeCssTw4(colors: ThemeColors): string {
  return `/* Tema del sitio: lo reescribe el botón «Tema» de EasyBits. Usa los tokens (bg-primary, text-on-surface…), no colores literales. */\n@theme {\n${vars(colors)}\n}\n`;
}

const TW3_CONFIG = `tailwind.config={theme:{extend:{colors:{${THEME_TOKENS.map((k) => `'${k}':'var(--color-${k})'`).join(",")}}}}}`;

/** Bloque del `<head>` de un sitio estático (Tailwind 3 por CDN). Va DESPUÉS del script de Tailwind. */
export function themeBlockStatic(colors: ThemeColors): string {
  return `<style id="eb-theme">\n:root {\n${vars(colors)}\n}\n</style>\n<script id="eb-theme-tw">${TW3_CONFIG}</script>`;
}

const STATIC_BLOCK = /<style id="eb-theme">[\s\S]*?<\/style>\s*<script id="eb-theme-tw">[\s\S]*?<\/script>/;

/** Reemplaza el bloque de tema de un HTML estático; null si el sitio no lo trae. */
export function replaceStaticTheme(html: string, colors: ThemeColors): string | null {
  if (!STATIC_BLOCK.test(html)) return null;
  return html.replace(STATIC_BLOCK, () => themeBlockStatic(colors));
}

/** Lee los tokens de un CSS/HTML de tema. Null si no están todos. */
export function parseThemeColors(text: string): ThemeColors | null {
  const found: Record<string, string> = {};
  for (const m of text.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)) found[m[1]] = m[2];
  return validThemeColors(found);
}
