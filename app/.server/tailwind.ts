/**
 * Horneado de Tailwind: compila el CSS server-side y quita el CDN del HTML.
 *
 * Por qué importa: los builders emiten `<script src="https://cdn.tailwindcss.com">`
 * SÍNCRONO en el `<head>`. En una página pública eso bloquea el render mientras
 * bajan ~400 KB, y sin caché compartida (iframe de origen opaco) se re-descarga en
 * CADA visita → la landing se ve EN BLANCO 20-30 segundos.
 *
 * No basta con `defer`: el segundo script (`tailwind.config = {...}`) lee el global
 * `tailwind` de inmediato y reventaría con `tailwind is not defined`. Hay que quitar
 * LOS DOS, que es lo que hace `replaceCdnWithCompiledCSS`.
 *
 * ⚠️ DUPLICADO TEMPORAL: esta lógica ya vive en
 * `packages/html-tailwind-generator/src/bake.ts` (subpath `./bake`) para que la
 * consuman los que ensamblan HTML por su cuenta con `buildDeployHtml`. Este archivo
 * pasa a ser un re-export en cuanto se publique el paquete; hasta entonces la app se
 * quedaría sin CSS si apuntara a un subpath que no existe en la versión instalada.
 */
import postcss from "postcss";
import tailwindcss from "tailwindcss";

const COLOR_VARS: Record<string, string> = {
  primary: "--color-primary", "primary-light": "--color-primary-light", "primary-dark": "--color-primary-dark",
  secondary: "--color-secondary", accent: "--color-accent",
  surface: "--color-surface", "surface-alt": "--color-surface-alt",
  "on-primary": "--color-on-primary", "on-secondary": "--color-on-secondary", "on-accent": "--color-on-accent",
  "on-surface": "--color-on-surface", "on-surface-muted": "--color-on-surface-muted",
};

const THEME_COLORS: Record<string, string> = {};
for (const [name, cssVar] of Object.entries(COLOR_VARS)) {
  THEME_COLORS[name] = `var(${cssVar})`;
}

// `g` + tolerancia a atributos extra: el builder v4 emite el script con saltos de
// línea y el v3 sin ellos, y una página puede traerlo más de una vez.
const CDN_SCRIPT_RE = /<script[^>]*src="https:\/\/cdn\.tailwindcss\.com"[^>]*><\/script>/gi;
const CONFIG_SCRIPT_RE = /<script>\s*tailwind\.config\s*=[\s\S]*?<\/script>/gi;

/**
 * Generate CSS rules for semantic color opacity variants (e.g. bg-primary/70).
 * Tailwind can't generate these from CSS vars, so we scan the HTML and emit them manually.
 */
function generateOpacityRules(html: string): string {
  const rules: string[] = [];
  // Match patterns like bg-primary/70, text-accent/30, border-secondary/10
  const regex = /(?:bg|text|border|from|to|ring)-([a-z][-a-z]*)\/(\d+)/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const [full] = m;
    const colorName = m[1];
    const opacity = m[2];
    if (!COLOR_VARS[colorName] || seen.has(full)) continue;
    seen.add(full);
    const cssVar = COLOR_VARS[colorName];
    const pct = `${opacity}%`;
    const escaped = full.replace("/", "\\/");
    const prop = full.startsWith("bg-") ? "background-color"
      : full.startsWith("text-") ? "color"
      : full.startsWith("border-") ? "border-color"
      : full.startsWith("ring-") ? "--tw-ring-color"
      : full.startsWith("from-") ? "--tw-gradient-from"
      : full.startsWith("to-") ? "--tw-gradient-to"
      : null;
    if (prop) {
      rules.push(`.${escaped} { ${prop}: color-mix(in srgb, var(${cssVar}) ${pct}, transparent); }`);
    }
  }
  return rules.join("\n");
}

const INPUT_CSS =
  "@tailwind base;\n@tailwind components;\n@tailwind utilities;";

export interface BakeOptions {
  /**
   * Clases que el escaneo estático NO puede ver porque se construyen en runtime
   * (`"bg-" + color`, plantillas, atributos escritos por JS). Al quitar el CDN
   * nadie las genera: decláralas aquí o desaparecen del CSS publicado.
   */
  safelist?: string[];
}

/**
 * Compile Tailwind CSS server-side by scanning the provided HTML for classes.
 * Produces the same output as the CDN script but without network/browser overhead.
 */
export async function compileTailwindCSS(
  html: string,
  options: BakeOptions = {}
): Promise<string> {
  const processor = postcss([
    tailwindcss({
      content: [{ raw: html, extension: "html" }],
      safelist: options.safelist ?? [],
      theme: {
        extend: {
          colors: THEME_COLORS,
        },
      },
    }),
  ]);

  const result = await processor.process(INPUT_CSS, { from: undefined });
  return result.css;
}

/**
 * Replace Tailwind CDN `<script>` + config script with a compiled `<style>` block.
 * Works on any HTML that uses the CDN pattern. Returns the optimized HTML.
 *
 * Idempotente: si no hay CDN (ya horneado, o nunca lo usó) devuelve el input tal cual.
 */
export async function replaceCdnWithCompiledCSS(
  html: string,
  options: BakeOptions = {}
): Promise<string> {
  CDN_SCRIPT_RE.lastIndex = 0; // el flag /g conserva estado entre llamadas
  if (!CDN_SCRIPT_RE.test(html)) return html;
  CDN_SCRIPT_RE.lastIndex = 0;

  const css = await compileTailwindCSS(html, options);
  const opacityRules = generateOpacityRules(html);
  const allCss = opacityRules ? `${css}\n/* Semantic color opacity */\n${opacityRules}` : css;

  const stripped = html.replace(CDN_SCRIPT_RE, "").replace(CONFIG_SCRIPT_RE, "");

  // El CSS compilado va DENTRO del primer <style> (y por delante), para que las
  // variables de tema que ese bloque define sigan ganando sobre las utilidades.
  if (stripped.includes("<style>")) {
    return stripped.replace("<style>", `<style>\n${allCss}\n`);
  }
  if (stripped.includes("</head>")) {
    return stripped.replace("</head>", `<style>\n${allCss}\n</style>\n</head>`);
  }
  return `<style>\n${allCss}\n</style>\n${stripped}`;
}
