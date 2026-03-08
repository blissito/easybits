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
    label: "Neutral",
    colors: {
      primary: "#18181b",
      "primary-light": "#3f3f46",
      "primary-dark": "#09090b",
      secondary: "#a1a1aa",
      accent: "#18181b",
      surface: "#ffffff",
      "surface-alt": "#fafafa",
      "on-surface": "#18181b",
      "on-surface-muted": "#71717a",
      "on-primary": "#ffffff",
    },
  },
  {
    id: "dark",
    label: "Dark",
    colors: {
      primary: "#e4e4e7",
      "primary-light": "#f4f4f5",
      "primary-dark": "#a1a1aa",
      secondary: "#71717a",
      accent: "#e4e4e7",
      surface: "#09090b",
      "surface-alt": "#18181b",
      "on-surface": "#fafafa",
      "on-surface-muted": "#a1a1aa",
      "on-primary": "#09090b",
    },
  },
  {
    id: "slate",
    label: "Slate",
    colors: {
      primary: "#3b82f6",
      "primary-light": "#60a5fa",
      "primary-dark": "#2563eb",
      secondary: "#64748b",
      accent: "#3b82f6",
      surface: "#ffffff",
      "surface-alt": "#f8fafc",
      "on-surface": "#0f172a",
      "on-surface-muted": "#64748b",
      "on-primary": "#ffffff",
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    colors: {
      primary: "#6366f1",
      "primary-light": "#818cf8",
      "primary-dark": "#4f46e5",
      secondary: "#94a3b8",
      accent: "#a78bfa",
      surface: "#0f172a",
      "surface-alt": "#1e293b",
      "on-surface": "#e2e8f0",
      "on-surface-muted": "#94a3b8",
      "on-primary": "#ffffff",
    },
  },
  {
    id: "warm",
    label: "Warm",
    colors: {
      primary: "#b45309",
      "primary-light": "#d97706",
      "primary-dark": "#92400e",
      secondary: "#78716c",
      accent: "#b45309",
      surface: "#fafaf9",
      "surface-alt": "#f5f5f4",
      "on-surface": "#1c1917",
      "on-surface-muted": "#78716c",
      "on-primary": "#ffffff",
    },
  },
];

export interface CustomColors {
  primary: string;
  secondary?: string;
  accent?: string;
  surface?: string;
}

function parseHex(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex: string) {
  const { r, g, b } = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function lighten(hex: string, amount = 40) {
  const { r, g, b } = parseHex(hex);
  return toHex(r + amount, g + amount, b + amount);
}

function darken(hex: string, amount = 40) {
  const { r, g, b } = parseHex(hex);
  return toHex(r - amount, g - amount, b - amount);
}

/**
 * Build a custom theme from user-chosen colors.
 * Derives light/dark variants and on-* contrast colors automatically.
 */
export function buildCustomTheme(colors: CustomColors): LandingTheme {
  const { primary, secondary = "#f59e0b", accent = "#06b6d4", surface = "#ffffff" } = colors;

  const onPrimary = luminance(primary) > 0.5 ? "#111827" : "#ffffff";
  const surfaceLum = luminance(surface);
  const isDarkSurface = surfaceLum < 0.5;

  return {
    id: "custom",
    label: "Custom",
    colors: {
      primary,
      "primary-light": lighten(primary),
      "primary-dark": darken(primary),
      secondary,
      accent,
      surface,
      "surface-alt": isDarkSurface ? lighten(surface, 20) : darken(surface, 5),
      "on-surface": isDarkSurface ? "#f1f5f9" : "#111827",
      "on-surface-muted": isDarkSurface ? "#94a3b8" : "#6b7280",
      "on-primary": onPrimary,
    },
  };
}

/**
 * Build CSS for a custom theme (used in preview — injected as override for [data-theme="custom"]).
 */
export function buildCustomThemeCss(colors: CustomColors): string {
  const theme = buildCustomTheme(colors);
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
