/**
 * bake — compila Tailwind server-side y elimina el CDN del HTML publicado.
 *
 * Por qué existe: `buildDeployHtml` emite `<script src="https://cdn.tailwindcss.com">`
 * SÍNCRONO en el `<head>`. En una página pública eso bloquea el render mientras se
 * descargan ~400 KB, y en contextos sin caché compartida (iframe de origen opaco)
 * se re-descarga en CADA visita: la landing se ve EN BLANCO 20-30 segundos.
 *
 * No basta con poner `defer` al CDN: el segundo script (`tailwind.config = {...}`)
 * lee el global `tailwind` de inmediato y reventaría con `tailwind is not defined`.
 * Hay que quitar (o diferir) LOS DOS. Aquí los quitamos y dejamos el CSS ya
 * compilado en su lugar.
 *
 * ⚠️ Al quitar el CDN desaparece el runtime que generaba clases al vuelo: una clase
 * construida en JS (`"bg-" + color`) deja de existir porque el escaneo estático no
 * la ve. Para eso está `safelist`.
 *
 * Vive en el paquete —y no en la app— porque quien sufre el problema es todo
 * consumidor de `buildDeployHtml`, no solo EasyBits.
 */
import postcss from "postcss";
import tailwindcss from "tailwindcss";

const COLOR_VARS: Record<string, string> = {
  primary: "--color-primary",
  "primary-light": "--color-primary-light",
  "primary-dark": "--color-primary-dark",
  secondary: "--color-secondary",
  accent: "--color-accent",
  surface: "--color-surface",
  "surface-alt": "--color-surface-alt",
  "on-primary": "--color-on-primary",
  "on-secondary": "--color-on-secondary",
  "on-accent": "--color-on-accent",
  "on-surface": "--color-on-surface",
  "on-surface-muted": "--color-on-surface-muted",
};

const THEME_COLORS: Record<string, string> = {};
for (const [name, cssVar] of Object.entries(COLOR_VARS)) {
  THEME_COLORS[name] = `var(${cssVar})`;
}

const CDN_SCRIPT_RE = /<script[^>]*src="https:\/\/cdn\.tailwindcss\.com"[^>]*><\/script>/gi;
const CONFIG_SCRIPT_RE = /<script>\s*tailwind\.config\s*=[\s\S]*?<\/script>/gi;

/**
 * Reglas para variantes semánticas con opacidad (`bg-primary/70`).
 * Tailwind no puede generarlas desde CSS vars, así que se escanea el HTML y se
 * emiten a mano. Sin esto, quitar el CDN las perdería en silencio.
 */
function generateOpacityRules(html: string): string {
  const rules: string[] = [];
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
    const escaped = full.replace("/", "\\/");
    const prop = full.startsWith("bg-")
      ? "background-color"
      : full.startsWith("text-")
        ? "color"
        : full.startsWith("border-")
          ? "border-color"
          : full.startsWith("ring-")
            ? "--tw-ring-color"
            : full.startsWith("from-")
              ? "--tw-gradient-from"
              : full.startsWith("to-")
                ? "--tw-gradient-to"
                : null;
    if (prop) {
      rules.push(
        `.${escaped} { ${prop}: color-mix(in srgb, var(${cssVar}) ${opacity}%, transparent); }`
      );
    }
  }
  return rules.join("\n");
}

const INPUT_CSS = "@tailwind base;\n@tailwind components;\n@tailwind utilities;";

export interface BakeOptions {
  /**
   * Clases que el escaneo estático no puede ver porque se construyen en tiempo
   * de ejecución (`"bg-" + color`, plantillas, atributos escritos por JS).
   * Sin el CDN nadie las genera: decláralas aquí o se pierden.
   */
  safelist?: string[];
  /** Colores extra del tema, además de los semánticos de EasyBits. */
  colors?: Record<string, string>;
}

/**
 * Compila el CSS de Tailwind que el HTML necesita, escaneándolo como contenido.
 * Mismo resultado que el script del CDN, sin red ni navegador.
 */
export async function compileTailwindCSS(
  html: string,
  options: BakeOptions = {}
): Promise<string> {
  const processor = postcss([
    (tailwindcss as unknown as (config: Record<string, unknown>) => postcss.AcceptedPlugin)({
      content: [{ raw: html, extension: "html" }],
      safelist: options.safelist ?? [],
      theme: { extend: { colors: { ...THEME_COLORS, ...(options.colors ?? {}) } } },
    }),
  ]);
  const result = await processor.process(INPUT_CSS, { from: undefined });
  return result.css;
}

/**
 * Sustituye el `<script>` del CDN de Tailwind + el `<script>` de config por un
 * `<style>` con el CSS ya compilado. Devuelve el HTML listo para publicar.
 *
 * Idempotente: si el HTML no trae el CDN, se devuelve intacto (ya horneado, o
 * nunca lo usó).
 */
export async function bakeTailwindHtml(
  html: string,
  options: BakeOptions = {}
): Promise<string> {
  if (!CDN_SCRIPT_RE.test(html)) return html;
  CDN_SCRIPT_RE.lastIndex = 0; // el flag /g mantiene estado entre tests

  const css = await compileTailwindCSS(html, options);
  const opacityRules = generateOpacityRules(html);
  const allCss = opacityRules
    ? `${css}\n/* Semantic color opacity */\n${opacityRules}`
    : css;

  const stripped = html.replace(CDN_SCRIPT_RE, "").replace(CONFIG_SCRIPT_RE, "");

  // Preferimos inyectar dentro del primer <style> existente (buildDeployHtml
  // siempre emite uno con las variables del tema, y el CSS compilado debe ir
  // ANTES para que esas variables ganen). Si no hay, abrimos uno en el <head>.
  if (stripped.includes("<style>")) {
    return stripped.replace("<style>", `<style>\n${allCss}\n`);
  }
  if (stripped.includes("</head>")) {
    return stripped.replace("</head>", `<style>\n${allCss}\n</style>\n</head>`);
  }
  return `<style>\n${allCss}\n</style>\n${stripped}`;
}

/** @deprecated nombre viejo en app/.server/tailwind.ts — usa bakeTailwindHtml. */
export const replaceCdnWithCompiledCSS = bakeTailwindHtml;
