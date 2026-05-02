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
    /** Slight tint of `surface` (almost-same lightness) — used for cards and
     *  alternating row backgrounds on a light page. NOT a dark contrast surface. */
    "surface-alt": string;
    /** A high-contrast dark surface that's INDEPENDENT of brand colors. Use
     *  for dark cards/footers/sidebars on light themes. Pairs with text-on-surface-deep. */
    "surface-deep": string;
    "on-surface": string;
    "on-surface-muted": string;
    "on-surface-deep": string;
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
      "surface-deep": "#18181b",
      "on-surface": "#18181b",
      "on-surface-muted": "#71717a",
      "on-surface-deep": "#fafafa",
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
      "surface-deep": "#1c1917",
      "on-surface": "#1c1917",
      "on-surface-muted": "#78716c",
      "on-surface-deep": "#fafaf9",
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
      "surface-deep": "#0f172a",
      "on-surface": "#0f172a",
      "on-surface-muted": "#64748b",
      "on-surface-deep": "#ffffff",
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
      "surface-deep": "#030712",
      "on-surface": "#f9fafb",
      "on-surface-muted": "#9ca3af",
      "on-surface-deep": "#f9fafb",
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
      "surface-deep": "#000000",
      "on-surface": "#fafafa",
      "on-surface-muted": "#a3a3a3",
      "on-surface-deep": "#fafafa",
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
      "surface-deep": "#1f2937",
      "on-surface": "#1f2937",
      "on-surface-muted": "#6b7280",
      "on-surface-deep": "#ffffff",
      "on-primary": "#ffffff",
      "on-secondary": "#ffffff",
      "on-accent": "#ffffff",
    },
  },
  {
    id: "lavanda",
    label: "Lavanda",
    colors: {
      primary: "#7c3aed",
      "primary-light": "#8b5cf6",
      "primary-dark": "#6d28d9",
      secondary: "#a78bfa",
      accent: "#ec4899",
      surface: "#faf5ff",
      "surface-alt": "#f3e8ff",
      "surface-deep": "#1e1b4b",
      "on-surface": "#1e1b4b",
      "on-surface-muted": "#6b7280",
      "on-surface-deep": "#ffffff",
      "on-primary": "#ffffff",
      "on-secondary": "#1e1b4b",
      "on-accent": "#ffffff",
    },
  },
  {
    id: "corporativo",
    label: "Corporativo",
    colors: {
      primary: "#1e3a5f",
      "primary-light": "#2d5986",
      "primary-dark": "#0f2440",
      secondary: "#64748b",
      accent: "#0ea5e9",
      surface: "#ffffff",
      "surface-alt": "#f1f5f9",
      "surface-deep": "#0f172a",
      "on-surface": "#0f172a",
      "on-surface-muted": "#64748b",
      "on-surface-deep": "#ffffff",
      "on-primary": "#ffffff",
      "on-secondary": "#ffffff",
      "on-accent": "#ffffff",
    },
  },
  {
    id: "esmeralda",
    label: "Esmeralda",
    colors: {
      primary: "#059669",
      "primary-light": "#10b981",
      "primary-dark": "#047857",
      secondary: "#6b7280",
      accent: "#f97316",
      surface: "#ffffff",
      "surface-alt": "#ecfdf5",
      "surface-deep": "#064e3b",
      "on-surface": "#064e3b",
      "on-surface-muted": "#6b7280",
      "on-surface-deep": "#ffffff",
      "on-primary": "#ffffff",
      "on-secondary": "#ffffff",
      "on-accent": "#ffffff",
    },
  },
  {
    id: "medianoche",
    label: "Medianoche",
    colors: {
      primary: "#3b82f6",
      "primary-light": "#60a5fa",
      "primary-dark": "#2563eb",
      secondary: "#94a3b8",
      accent: "#facc15",
      surface: "#0f172a",
      "surface-alt": "#1e293b",
      "surface-deep": "#020617",
      "on-surface": "#f1f5f9",
      "on-surface-muted": "#94a3b8",
      "on-surface-deep": "#f1f5f9",
      "on-primary": "#ffffff",
      "on-secondary": "#0f172a",
      "on-accent": "#0f172a",
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
  lavanda: "Purple/violet tones — creative, dreamy, soft purple surfaces with pink accent",
  corporativo: "Navy blue professional — classic corporate feel, slate grays, sky blue accent",
  esmeralda: "Emerald green — fresh, trustworthy, white surfaces with warm orange accent",
  medianoche: "DARK blue theme — deep navy surfaces, bright blue primary, gold accent. Surfaces are dark, text is light.",
};

/**
 * Build a prompt context string describing the active theme + its hex values.
 * Used by both generate and refine to give the AI concrete color awareness.
 *
 * For built-in themes (modern, brutalist, etc.) the palette is looked up in
 * LANDING_THEMES. For custom themes, pass customColors so the AI sees the
 * user-picked hex values — otherwise the AI generates "blind" against custom
 * palettes and tends to emit arbitrary `bg-[#hex]` classes.
 */
export function buildThemePromptContext(
  themeName: string,
  customColors?: Partial<CustomColors> | Record<string, string>
): string {
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
    return lines.join("\n");
  }

  // Custom theme — emit user-picked hex values so the AI knows the actual palette.
  // Without this, the model has zero color context and routinely emits arbitrary
  // `bg-[#hex]` classes (which the sanitizer then has to scrub).
  if (customColors) {
    const present = Object.entries(customColors).filter(
      ([, v]) => typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v as string)
    );
    if (present.length > 0) {
      lines.push("Actual color values for this CUSTOM theme (user-picked):");
      for (const [key, hex] of present) {
        lines.push(`  - ${key}: ${hex}`);
      }
      lines.push("These are the EXACT hex values that the semantic classes resolve to. Use the SEMANTIC CLASS (bg-primary), NEVER the hex (bg-[" + (present[0][1] as string) + "]) — the class system handles the mapping.");
    }
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
      // surface-deep is the high-contrast dark surface, independent of brand.
      // For light themes: a near-black neutral. For dark themes: even darker than surface.
      "surface-deep": isDarkSurface ? darken(surface, 40) : "#18181b",
      "on-surface": isDarkSurface ? "#f1f5f9" : "#111827",
      "on-surface-muted": isDarkSurface ? "#94a3b8" : "#6b7280",
      "on-surface-deep": isDarkSurface ? "#f1f5f9" : "#fafafa",
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
