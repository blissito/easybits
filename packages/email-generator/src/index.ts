/**
 * @easybits.cloud/email-generator
 *
 * Turns EasyBits document sections (`Section3[]`) into email-safe HTML: a single-column
 * flow layout, every style inlined onto `style=` attributes, no Tailwind classes left in
 * the output, no `<script>`, wrapped in a table shell. Built for Gmail/Outlook.
 *
 * Pipeline (mechanical, best-effort):
 *   1. assemble section HTML in flow order (scripts stripped)
 *   2. compile the Tailwind classes the sections use → real CSS (semantic color classes
 *      resolve via the theme variables you pass in `themeCss`)
 *   3. flatten `var(--color-*)` to literal hex (Outlook has no CSS custom properties)
 *   4. inline all CSS onto elements with `juice`
 *   5. wrap in a centered table shell
 *
 * CAVEATS (documented, accepted): email clients ignore `position:absolute`, CSS grid, and
 * most flex. Documents authored with absolute cover layouts degrade — compose email content
 * in flow (stacked blocks). Fixed pixel widths wider than `maxWidth` will overflow on mobile.
 */
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import juice from "juice";
import type { Section3 } from "@easybits.cloud/html-tailwind-generator";

export interface BuildEmailHtmlOptions {
  /** Document title (used in <title> and as a sensible default subject). */
  title?: string;
  /**
   * ":root { --color-*: <hex>; }" with LITERAL values (e.g. the output of the editor's
   * `buildSingleThemeCss(theme).css`). Drives two things: which semantic color classes
   * compile (bg-primary, text-on-surface, …) and what literal each `var()` flattens to.
   * If omitted, a neutral light theme is used.
   */
  themeCss?: string;
  /** Email body max width in px (default 600 — the classic safe email width). */
  maxWidth?: number;
  /** Hidden preview snippet shown in the inbox list before the email is opened. */
  preheader?: string;
  /** Page background behind the centered card (default "#f4f4f4"). */
  backgroundColor?: string;
}

const DEFAULT_THEME_CSS = `:root {
  --color-primary: #18181b; --color-primary-light: #3f3f46; --color-primary-dark: #09090b;
  --color-secondary: #71717a; --color-accent: #2563eb;
  --color-surface: #ffffff; --color-surface-alt: #f4f4f5;
  --color-on-surface: #18181b; --color-on-surface-muted: #71717a;
  --color-on-primary: #ffffff; --color-on-secondary: #ffffff; --color-on-accent: #ffffff;
}`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Parse "--color-<key>: <value>;" pairs from a :root block. */
function parseThemeVars(themeCss: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--color-([\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(themeCss))) out[m[1]] = m[2].trim();
  return out;
}

/** Replace `var(--color-key)` / `var(--color-key, fallback)` with the literal value. */
function flattenColorVars(css: string, vars: Record<string, string>): string {
  return css.replace(/var\(\s*--color-([\w-]+)\s*(?:,[^)]*)?\)/g, (full, key: string) => vars[key] ?? full);
}

/** Drop <script> blocks and self-closing scripts (incl. the Tailwind CDN tag). */
function stripScripts(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/>/gi, "");
}

/**
 * Build email-safe HTML from document sections.
 *
 * @param sections Ordered document sections (same shape the editor produces).
 * @param opts     Theme + layout options (see {@link BuildEmailHtmlOptions}).
 * @returns A complete, inlined HTML email document.
 */
export async function buildEmailHtml(
  sections: Section3[],
  opts: BuildEmailHtmlOptions = {}
): Promise<string> {
  const themeCss = opts.themeCss || DEFAULT_THEME_CSS;
  const maxWidth = opts.maxWidth ?? 600;
  const backgroundColor = opts.backgroundColor ?? "#f4f4f4";
  const title = opts.title || "Documento";

  const sorted = [...sections]
    .filter((s) => s.id !== "__grapes_css__" && s.label !== "__css__")
    .sort((a, b) => a.order - b.order);

  // 1. Assemble section HTML in flow order (scripts stripped). Each section is a full-width
  // block; the section's own classes handle its internal layout.
  const inner = sorted
    .map((s) => `<div style="width:100%;">${stripScripts(s.html)}</div>`)
    .join("\n");

  // 2. Compile the Tailwind utilities the sections use. Semantic color classes resolve
  // against the theme variables (primary/on-surface/…). Preflight off — email needs no reset.
  const themeVars = parseThemeVars(themeCss);
  const colorsMap: Record<string, string> = {};
  for (const key of Object.keys(themeVars)) colorsMap[key] = `var(--color-${key})`;

  const result = await postcss([
    // tailwindcss accepts an inline config object; types expect a file path so cast.
    (tailwindcss as unknown as (config: unknown) => postcss.AcceptedPlugin)({
      content: [{ raw: inner, extension: "html" }],
      corePlugins: { preflight: false },
      theme: { extend: { colors: colorsMap } },
    }),
  ]).process("@tailwind utilities;", { from: undefined });

  // 3. Flatten var(--color-*) → literal hex (Outlook has no custom properties).
  const flatCss = flattenColorVars(result.css, themeVars);

  // 4. Assemble the full email doc with the compiled CSS in <head>, then inline everything.
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(opts.preheader)}</div>`
    : "";

  const doc = `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>${escapeHtml(title)}</title>
<style>${flatCss}</style>
</head>
<body style="margin:0;padding:0;background-color:${backgroundColor};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${backgroundColor};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="${maxWidth}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${maxWidth}px;margin:0 auto;background-color:#ffffff;">
      <tr><td style="padding:0;">${inner}</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  // 5. Inline all CSS onto style= attributes. Keep media queries / font-faces in a head
  // <style> (juice can't inline those); drop the rest of the style tags.
  return juice(doc, {
    removeStyleTags: true,
    preserveMediaQueries: true,
    preserveFontFaces: true,
    preserveImportant: true,
  });
}

export type { Section3 };
