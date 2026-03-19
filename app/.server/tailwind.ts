import postcss from "postcss";
import tailwindcss from "tailwindcss";

const THEME_COLORS = {
  primary: "var(--color-primary)",
  "primary-light": "var(--color-primary-light)",
  "primary-dark": "var(--color-primary-dark)",
  secondary: "var(--color-secondary)",
  accent: "var(--color-accent)",
  surface: "var(--color-surface)",
  "surface-alt": "var(--color-surface-alt)",
  "on-primary": "var(--color-on-primary)",
  "on-secondary": "var(--color-on-secondary)",
  "on-accent": "var(--color-on-accent)",
  "on-surface": "var(--color-on-surface)",
  "on-surface-muted": "var(--color-on-surface-muted)",
};

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
