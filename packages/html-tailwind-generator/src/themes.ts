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
    "on-secondary": string;
    "on-accent": string;
  };
}

export const LANDING_THEMES: LandingTheme[] = [
  {
    id: "minimal",
    label: "Minimal",
    colors: {
      primary: "#18181b",
      "primary-light": "#3f3f46",
      "primary-dark": "#09090b",
      secondary: "#71717a",
      accent: "#2563eb",
      surface: "#ffffff",
      "surface-alt": "#f4f4f5",
      "on-surface": "#18181b",
      "on-surface-muted": "#71717a",
      "on-primary": "#ffffff",
      "on-secondary": "#ffffff",
      "on-accent": "#ffffff",
    },
  },
  {
    id: "calido",
    label: "Cálido",
    colors: {
      primary: "#9a3412",
      "primary-light": "#c2410c",
      "primary-dark": "#7c2d12",
      secondary: "#78716c",
      accent: "#d97706",
      surface: "#fafaf9",
      "surface-alt": "#f5f5f4",
      "on-surface": "#1c1917",
      "on-surface-muted": "#78716c",
      "on-primary": "#ffffff",
      "on-secondary": "#ffffff",
      "on-accent": "#111827",
    },
  },
  {
    id: "oceano",
    label: "Océano",
    colors: {
      primary: "#0f4c75",
      "primary-light": "#1a6fa0",
      "primary-dark": "#0a3555",
      secondary: "#6b7280",
      accent: "#0d9488",
      surface: "#ffffff",
      "surface-alt": "#f0fdfa",
      "on-surface": "#0f172a",
      "on-surface-muted": "#64748b",
      "on-primary": "#ffffff",
      "on-secondary": "#ffffff",
      "on-accent": "#ffffff",
    },
  },
  {
    id: "noche",
    label: "Noche",
    colors: {
      primary: "#a78bfa",
      "primary-light": "#c4b5fd",
      "primary-dark": "#7c3aed",
      secondary: "#9ca3af",
      accent: "#f472b6",
      surface: "#111827",
      "surface-alt": "#1f2937",
      "on-surface": "#f9fafb",
      "on-surface-muted": "#9ca3af",
      "on-primary": "#111827",
      "on-secondary": "#111827",
      "on-accent": "#111827",
    },
  },
  {
    id: "bosque",
    label: "Bosque",
    colors: {
      primary: "#16a34a",
      "primary-light": "#22c55e",
      "primary-dark": "#15803d",
      secondary: "#a3a3a3",
      accent: "#f59e0b",
      surface: "#0a0a0a",
      "surface-alt": "#171717",
      "on-surface": "#fafafa",
      "on-surface-muted": "#a3a3a3",
      "on-primary": "#ffffff",
      "on-secondary": "#111827",
      "on-accent": "#111827",
    },
  },
  {
    id: "rosa",
    label: "Rosa",
    colors: {
      primary: "#be185d",
      "primary-light": "#db2777",
      "primary-dark": "#9d174d",
      secondary: "#6b7280",
      accent: "#8b5cf6",
      surface: "#ffffff",
      "surface-alt": "#fdf2f8",
      "on-surface": "#1f2937",
      "on-surface-muted": "#6b7280",
      "on-primary": "#ffffff",
      "on-secondary": "#ffffff",
      "on-accent": "#ffffff",
    },
  },
];

export const THEME_DESCRIPTIONS: Record<string, string> = {
  minimal: "Clean, light, professional — white surfaces, subtle grays, minimal decoration",
  calido: "Warm tones — amber/orange primary, cream surfaces, cozy and inviting feel",
  oceano: "Cool blue tones — deep ocean blues, clean white surfaces, professional and fresh",
  noche: "DARK theme — very dark surfaces, purple/violet accents, moody and modern. Surfaces are dark, text is light.",
  bosque: "DARK nature theme — black surfaces, vibrant green primary, amber accents. Surfaces are dark, text is light.",
  rosa: "Soft pink/rose tones — delicate, feminine, elegant with light surfaces",
};

/**
 * Build a prompt context string describing the active theme + its hex values.
 * Used by both generate and refine to give the AI concrete color awareness.
 */
export function buildThemePromptContext(themeName: string): string {
  const desc = THEME_DESCRIPTIONS[themeName] || themeName;
  const lines: string[] = [];
  lines.push(`Active theme: "${themeName}" — ${desc}`);
  lines.push("The CSS variables for this theme are already loaded. Just use the semantic classes (bg-primary, text-on-surface, bg-accent, etc.). The theme handles the actual color values.");
  const themeObj = LANDING_THEMES.find(t => t.id === themeName);
  if (themeObj) {
    lines.push("Actual color values for this theme:");
    for (const [key, hex] of Object.entries(themeObj.colors)) {
      lines.push(`  - ${key}: ${hex}`);
    }
    lines.push("Use these values to understand the visual mood. Generate designs that COMPLEMENT these specific colors.");
  }
  return lines.join("\n");
}

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

export function buildCustomTheme(colors: CustomColors): LandingTheme {
  const { primary, secondary = "#f59e0b", accent = "#06b6d4", surface = "#ffffff" } = colors;

  const onPrimary = luminance(primary) > 0.5 ? "#111827" : "#ffffff";
  const onSecondary = luminance(secondary) > 0.5 ? "#111827" : "#ffffff";
  const onAccent = luminance(accent) > 0.5 ? "#111827" : "#ffffff";
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
      "on-secondary": onSecondary,
      "on-accent": onAccent,
    },
  };
}

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

export function buildThemeCss(): { css: string; tailwindConfig: string } {
  const defaultTheme = LANDING_THEMES[0];

  const overrides = LANDING_THEMES.slice(1)
    .map((t) => `[data-theme="${t.id}"] {\n${buildCssVars(t.colors)}\n}`)
    .join("\n\n");

  const css = `:root {\n${buildCssVars(defaultTheme.colors)}\n}\n\n${overrides}`;
  return { css, tailwindConfig: buildTailwindConfig() };
}

export function buildSingleThemeCss(themeId: string): { css: string; tailwindConfig: string } {
  const theme = LANDING_THEMES.find((t) => t.id === themeId) || LANDING_THEMES[0];
  const css = `:root {\n${buildCssVars(theme.colors)}\n}`;
  return { css, tailwindConfig: buildTailwindConfig() };
}
