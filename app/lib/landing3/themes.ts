export interface LandingTheme {
  id: string;
  label: string;
  colors: {
    primary: string;
    "primary-light": string;
    "primary-dark": string;
    secondary: string;
    accent: string;
    surface: string;
    "surface-alt": string;
    "on-surface": string;
    "on-surface-muted": string;
    "on-primary": string;
  };
}

export const LANDING_THEMES: LandingTheme[] = [
  {
    id: "default",
    label: "Indigo",
    colors: {
      primary: "#6366f1",
      "primary-light": "#818cf8",
      "primary-dark": "#4f46e5",
      secondary: "#f59e0b",
      accent: "#06b6d4",
      surface: "#ffffff",
      "surface-alt": "#f9fafb",
      "on-surface": "#111827",
      "on-surface-muted": "#6b7280",
      "on-primary": "#ffffff",
    },
  },
  {
    id: "dark",
    label: "Dark",
    colors: {
      primary: "#a78bfa",
      "primary-light": "#c4b5fd",
      "primary-dark": "#7c3aed",
      secondary: "#fbbf24",
      accent: "#22d3ee",
      surface: "#0f172a",
      "surface-alt": "#1e293b",
      "on-surface": "#f1f5f9",
      "on-surface-muted": "#94a3b8",
      "on-primary": "#ffffff",
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    colors: {
      primary: "#0891b2",
      "primary-light": "#22d3ee",
      "primary-dark": "#0e7490",
      secondary: "#f97316",
      accent: "#8b5cf6",
      surface: "#ffffff",
      "surface-alt": "#f0f9ff",
      "on-surface": "#0c4a6e",
      "on-surface-muted": "#64748b",
      "on-primary": "#ffffff",
    },
  },
  {
    id: "warm",
    label: "Warm",
    colors: {
      primary: "#ea580c",
      "primary-light": "#fb923c",
      "primary-dark": "#c2410c",
      secondary: "#eab308",
      accent: "#dc2626",
      surface: "#ffffff",
      "surface-alt": "#fffbeb",
      "on-surface": "#1c1917",
      "on-surface-muted": "#78716c",
      "on-primary": "#ffffff",
    },
  },
  {
    id: "forest",
    label: "Forest",
    colors: {
      primary: "#059669",
      "primary-light": "#34d399",
      "primary-dark": "#047857",
      secondary: "#d97706",
      accent: "#0d9488",
      surface: "#ffffff",
      "surface-alt": "#f0fdf4",
      "on-surface": "#14532d",
      "on-surface-muted": "#6b7280",
      "on-primary": "#ffffff",
    },
  },
  {
    id: "rose",
    label: "Rose",
    colors: {
      primary: "#e11d48",
      "primary-light": "#fb7185",
      "primary-dark": "#be123c",
      secondary: "#a855f7",
      accent: "#ec4899",
      surface: "#ffffff",
      "surface-alt": "#fff1f2",
      "on-surface": "#1c1917",
      "on-surface-muted": "#71717a",
      "on-primary": "#ffffff",
    },
  },
];

/**
 * Build a custom theme from a primary color hex.
 * Derives light/dark variants and picks complementary secondary/accent.
 */
export function buildCustomTheme(primary: string): LandingTheme {
  const r = parseInt(primary.slice(1, 3), 16);
  const g = parseInt(primary.slice(3, 5), 16);
  const b = parseInt(primary.slice(5, 7), 16);

  const lighter = (c: number) => Math.min(255, c + 40);
  const darker = (c: number) => Math.max(0, c - 40);
  const hex = (r: number, g: number, b: number) =>
    `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

  // Luminance check for on-primary contrast
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const onPrimary = lum > 0.5 ? "#111827" : "#ffffff";

  return {
    id: "custom",
    label: "Custom",
    colors: {
      primary,
      "primary-light": hex(lighter(r), lighter(g), lighter(b)),
      "primary-dark": hex(darker(r), darker(g), darker(b)),
      secondary: "#f59e0b",
      accent: "#06b6d4",
      surface: "#ffffff",
      "surface-alt": "#f9fafb",
      "on-surface": "#111827",
      "on-surface-muted": "#6b7280",
      "on-primary": onPrimary,
    },
  };
}

/**
 * Build CSS for a custom theme (used in preview — injected as override for [data-theme="custom"]).
 */
export function buildCustomThemeCss(primary: string): string {
  const theme = buildCustomTheme(primary);
  return `[data-theme="custom"] {\n${buildCssVars(theme.colors)}\n}`;
}

/** CSS custom properties for a theme */
function buildCssVars(colors: LandingTheme["colors"]): string {
  return Object.entries(colors)
    .map(([k, v]) => `  --color-${k}: ${v};`)
    .join("\n");
}

/** Build the tailwind.config JS object string for TW v3 CDN */
function buildTailwindConfig(): string {
  const colorEntries = Object.keys(LANDING_THEMES[0].colors)
    .map((k) => `          '${k}': 'var(--color-${k})'`)
    .join(",\n");

  return `{
    theme: {
      extend: {
        colors: {
${colorEntries}
        }
      }
    }
  }`;
}

/**
 * Build CSS variables for all themes (preview — all themes available via data-theme).
 * Returns { css, tailwindConfig }.
 */
export function buildThemeCss(): { css: string; tailwindConfig: string } {
  const defaultTheme = LANDING_THEMES[0];

  const overrides = LANDING_THEMES.slice(1)
    .map((t) => `[data-theme="${t.id}"] {\n${buildCssVars(t.colors)}\n}`)
    .join("\n\n");

  const css = `:root {\n${buildCssVars(defaultTheme.colors)}\n}\n\n${overrides}`;
  return { css, tailwindConfig: buildTailwindConfig() };
}

/**
 * Build CSS variables for a single theme (deploy HTML).
 * Returns { css, tailwindConfig }.
 */
export function buildSingleThemeCss(themeId: string): { css: string; tailwindConfig: string } {
  const theme = LANDING_THEMES.find((t) => t.id === themeId) || LANDING_THEMES[0];
  const css = `:root {\n${buildCssVars(theme.colors)}\n}`;
  return { css, tailwindConfig: buildTailwindConfig() };
}
