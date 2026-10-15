// Portado de ghosty-studio (`app/lib/pages/community-themes.ts`, mismo dueño). Paletas populares
// con licencia MIT (Catppuccin, Nord, Dracula, Tokyo Night, Rosé Pine, Gruvbox, Solarized, GitHub
// Primer): se toman sus colores base y se derivan los tokens que faltan con contraste.
import type { LandingTheme } from "./themes";

type Spec = { id: string; label: string; surface: string; alt: string; deep: string; text: string; muted: string; primary: string; secondary: string; accent: string };

const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => hex(v + (y[i] - v) * t)).join("")}`;
};
/** Luminancia relativa (WCAG). */
export const luminance = (h: string) => {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/** El texto que MÁS contrasta sobre ese fondo (blanco o casi negro). */
const onColor = (bg: string) => (contrast(bg, "#ffffff") >= contrast(bg, "#111111") ? "#ffffff" : "#111111");

function build(s: Spec): LandingTheme {
  return {
    id: s.id,
    label: s.label,
    colors: {
      primary: s.primary,
      "primary-light": mix(s.primary, "#ffffff", 0.25),
      "primary-dark": mix(s.primary, "#000000", 0.25),
      secondary: s.secondary,
      accent: s.accent,
      surface: s.surface,
      "surface-alt": s.alt,
      "surface-deep": s.deep,
      "on-surface": s.text,
      "on-surface-muted": s.muted,
      "on-surface-deep": onColor(s.deep),
      "on-primary": onColor(s.primary),
      "on-secondary": onColor(s.secondary),
      "on-accent": onColor(s.accent),
    },
  };
}

export const COMMUNITY_THEMES: LandingTheme[] = [
  // Claros
  { id: "catppuccin-latte", label: "Catppuccin Latte", surface: "#eff1f5", alt: "#e6e9ef", deep: "#4c4f69", text: "#4c4f69", muted: "#6c6f85", primary: "#8839ef", secondary: "#1e66f5", accent: "#fe640b" },
  { id: "nord-light", label: "Nord Claro", surface: "#eceff4", alt: "#e5e9f0", deep: "#2e3440", text: "#2e3440", muted: "#4c566a", primary: "#5e81ac", secondary: "#81a1c1", accent: "#bf616a" },
  { id: "rose-pine-dawn", label: "Rosé Pine Dawn", surface: "#faf4ed", alt: "#f2e9e1", deep: "#575279", text: "#575279", muted: "#797593", primary: "#286983", secondary: "#907aa9", accent: "#b4637a" },
  { id: "solarized-light", label: "Solarized", surface: "#fdf6e3", alt: "#eee8d5", deep: "#073642", text: "#073642", muted: "#586e75", primary: "#268bd2", secondary: "#2aa198", accent: "#cb4b16" },
  { id: "gruvbox-light", label: "Gruvbox Claro", surface: "#fbf1c7", alt: "#ebdbb2", deep: "#3c3836", text: "#3c3836", muted: "#665c54", primary: "#af3a03", secondary: "#076678", accent: "#79740e" },
  { id: "github-light", label: "GitHub", surface: "#ffffff", alt: "#f6f8fa", deep: "#1f2328", text: "#1f2328", muted: "#59636e", primary: "#0969da", secondary: "#8250df", accent: "#1a7f37" },
  // Oscuros
  { id: "dracula", label: "Dracula", surface: "#282a36", alt: "#44475a", deep: "#1e1f29", text: "#f8f8f2", muted: "#c3c6d4", primary: "#bd93f9", secondary: "#8be9fd", accent: "#ff79c6" },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", surface: "#1e1e2e", alt: "#313244", deep: "#11111b", text: "#cdd6f4", muted: "#a6adc8", primary: "#cba6f7", secondary: "#89b4fa", accent: "#fab387" },
  { id: "nord", label: "Nord", surface: "#2e3440", alt: "#3b4252", deep: "#242933", text: "#eceff4", muted: "#d8dee9", primary: "#88c0d0", secondary: "#81a1c1", accent: "#d08770" },
  { id: "tokyo-night", label: "Tokyo Night", surface: "#1a1b26", alt: "#24283b", deep: "#16161e", text: "#c0caf5", muted: "#a9b1d6", primary: "#7aa2f7", secondary: "#bb9af7", accent: "#ff9e64" },
  { id: "rose-pine", label: "Rosé Pine", surface: "#191724", alt: "#1f1d2e", deep: "#12101a", text: "#e0def4", muted: "#908caa", primary: "#ebbcba", secondary: "#c4a7e7", accent: "#f6c177" },
  { id: "gruvbox-dark", label: "Gruvbox", surface: "#282828", alt: "#3c3836", deep: "#1d2021", text: "#ebdbb2", muted: "#bdae93", primary: "#fe8019", secondary: "#8ec07c", accent: "#fabd2f" },
].map(build);

const HEX = /^#[0-9a-f]{6}$/i;
export type ThemeTweak = { primary?: string; accent?: string; surface?: string };

/**
 * «Personalizado» a partir del tema actual: cambia principal, acento y/o fondo y re-deriva lo que
 * cuelga de cada uno (variantes, texto encima con el mejor contraste, el gris del texto y la
 * tarjeta). Lo usan el panel (vista previa en vivo) y el servidor (lo que se guarda): el mismo cálculo.
 */
export function customizeColors(colors: Record<string, string>, next: ThemeTweak): Record<string, string> {
  const out = { ...colors };
  if (next.primary && HEX.test(next.primary)) {
    out.primary = next.primary.toLowerCase();
    out["primary-light"] = mix(out.primary, "#ffffff", 0.25);
    out["primary-dark"] = mix(out.primary, "#000000", 0.25);
    out["on-primary"] = onColor(out.primary);
  }
  if (next.accent && HEX.test(next.accent)) {
    out.accent = next.accent.toLowerCase();
    out["on-accent"] = onColor(out.accent);
  }
  if (next.surface && HEX.test(next.surface)) {
    out.surface = next.surface.toLowerCase();
    const text = onColor(out.surface) === "#ffffff" ? "#f4f4f5" : "#18181b";
    out["on-surface"] = text;
    out["on-surface-muted"] = mix(text, out.surface, 0.35);
    out["surface-alt"] = mix(out.surface, text, 0.05);
  }
  return out;
}
