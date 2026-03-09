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
    id: "notion",
    label: "Notion",
    colors: {
      primary: "#37352f",
      "primary-light": "#55534e",
      "primary-dark": "#25231e",
      secondary: "#787774",
      accent: "#2eaadc",
      surface: "#ffffff",
      "surface-alt": "#f7f6f3",
      "on-surface": "#37352f",
      "on-surface-muted": "#787774",
      "on-primary": "#ffffff",
    },
  },
  {
    id: "stripe",
    label: "Stripe",
    colors: {
      primary: "#635bff",
      "primary-light": "#7a73ff",
      "primary-dark": "#4b44cc",
      secondary: "#6b7280",
      accent: "#635bff",
      surface: "#ffffff",
      "surface-alt": "#f6f9fc",
      "on-surface": "#0a2540",
      "on-surface-muted": "#596068",
      "on-primary": "#ffffff",
    },
  },
  {
    id: "vercel",
    label: "Vercel",
    colors: {
      primary: "#000000",
      "primary-light": "#333333",
      "primary-dark": "#000000",
      secondary: "#666666",
      accent: "#0070f3",
      surface: "#ffffff",
      "surface-alt": "#fafafa",
      "on-surface": "#171717",
      "on-surface-muted": "#666666",
      "on-primary": "#ffffff",
    },
  },
  {
    id: "linear",
    label: "Linear",
    colors: {
      primary: "#5e6ad2",
      "primary-light": "#7b84e0",
      "primary-dark": "#4850a8",
      secondary: "#9ba1a6",
      accent: "#a78bfa",
      surface: "#1b1b25",
      "surface-alt": "#23232f",
      "on-surface": "#edeef0",
      "on-surface-muted": "#9ba1a6",
      "on-primary": "#ffffff",
    },
  },
  {
    id: "spotify",
    label: "Spotify",
    colors: {
      primary: "#1db954",
      "primary-light": "#1ed760",
      "primary-dark": "#1aa34a",
      secondary: "#b3b3b3",
      accent: "#1ed760",
      surface: "#121212",
      "surface-alt": "#1a1a1a",
      "on-surface": "#ffffff",
      "on-surface-muted": "#a7a7a7",
      "on-primary": "#000000",
    },
  },
  {
    id: "easybits",
    label: "Easybits",
    colors: {
      primary: "#9870ED",
      "primary-light": "#b196f3",
      "primary-dark": "#7a52d6",
      secondary: "#6A6966",
      accent: "#ECD66E",
      surface: "#ffffff",
      "surface-alt": "#F3F0F5",
      "on-surface": "#181818",
      "on-surface-muted": "#6A6966",
      "on-primary": "#ffffff",
    },
  },
  {
    id: "denik",
    label: "Denik",
    colors: {
      primary: "#5158F6",
      "primary-light": "#7478f8",
      "primary-dark": "#3d43c5",
      secondary: "#4B5563",
      accent: "#FFD75E",
      surface: "#ffffff",
      "surface-alt": "#F8F8F8",
      "on-surface": "#11151A",
      "on-surface-muted": "#4B5563",
      "on-primary": "#ffffff",
    },
  },
  {
    id: "warm",
    label: "Warm",
    colors: {
      primary: "#c2410c",
      "primary-light": "#ea580c",
      "primary-dark": "#9a3412",
      secondary: "#78716c",
      accent: "#c2410c",
      surface: "#fffbf5",
      "surface-alt": "#faf5ee",
      "on-surface": "#1c1917",
      "on-surface-muted": "#6b6560",
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
