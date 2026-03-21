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

/**
 * Compile Tailwind CSS server-side by scanning the provided HTML for classes.
 * Produces the same output as the CDN script but without network/browser overhead.
 */
export async function compileTailwindCSS(html: string): Promise<string> {
  const processor = postcss([
    tailwindcss({
      content: [{ raw: html, extension: "html" }],
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
 */
export async function replaceCdnWithCompiledCSS(
  html: string
): Promise<string> {
  const css = await compileTailwindCSS(html);
  const opacityRules = generateOpacityRules(html);
  const allCss = opacityRules ? `${css}\n/* Semantic color opacity */\n${opacityRules}` : css;
  return html
    .replace(
      /<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/,
      ""
    )
    .replace(/<script>\s*tailwind\.config\s*=\s*\{.*?\}\s*<\/script>/s, "")
    .replace("<style>", `<style>\n${allCss}\n`);
}
