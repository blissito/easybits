/**
 * Social media format presets for documents (Landing v4).
 *
 * Used by:
 *   - `create_document` MCP tool — agents pass `format.preset` to create
 *     documents with the right dimensions for IG/LI/Stories carousels.
 *   - `open_design_in_editor` / `import_html` MCP tools — same shape, used
 *     when importing pre-existing HTML.
 *
 * `intent` is derived from the aspect ratio so the editor can show the
 * right export CTA ("Exportar PNG" for social, PDF for documents, etc.).
 */

export const SOCIAL_PRESETS = {
  // Square (1:1) — IG/FB
  "ig-square":  { width: 1080, height: 1080 },
  "fb-square":  { width: 1080, height: 1080 },
  // Portrait 4:5 — IG / LinkedIn feed carousels
  "ig-feed":    { width: 1080, height: 1350 },
  "li-feed":    { width: 1080, height: 1350 },
  // Vertical 9:16 — Stories / Reels / WhatsApp Status / TikTok
  "ig-story":   { width: 1080, height: 1920 },
  "wsp-status": { width: 1080, height: 1920 },
  "tiktok":     { width: 1080, height: 1920 },
  // Landscape 16:9 — slides
  "slide-16-9": { width: 1920, height: 1080 },
  // Default Letter — keep `undefined` so callers fall through to the
  // default Letter rendering path (no `metadata.format`).
  "letter":     undefined,
  // Legacy aliases — kept for backward compat with `open_design_in_editor`
  "1080x1080":  { width: 1080, height: 1080 },
  "1080x1350":  { width: 1080, height: 1350 },
} as const;

export type SocialPresetKey = keyof typeof SOCIAL_PRESETS;

export const SOCIAL_PRESET_KEYS = Object.keys(SOCIAL_PRESETS) as SocialPresetKey[];

export type Intent = "social" | "presentation" | "document";

/**
 * Infer artifact intent from page dimensions. `undefined` → "document".
 */
export function detectIntent(format?: { width: number; height: number }): Intent {
  if (!format) return "document";
  const { width, height } = format;
  if (!width || !height) return "document";
  const ratio = width / height;
  // Square (1:1) — IG/LI carousel
  if (ratio >= 0.95 && ratio <= 1.05) return "social";
  // Portrait 4:5 (0.8) — LI carousel / IG feed portrait
  if (ratio >= 0.78 && ratio <= 0.82) return "social";
  // Portrait 9:16 (0.5625) — Reels/Stories
  if (ratio >= 0.55 && ratio <= 0.58) return "social";
  // Landscape 16:9 (1.777) — presentation deck
  if (ratio >= 1.7 && ratio <= 1.85) return "presentation";
  // Landscape 4:3 (1.333) — classic deck
  if (ratio >= 1.3 && ratio <= 1.36) return "presentation";
  return "document";
}

export interface FormatInput {
  preset?: SocialPresetKey;
  width?: number;
  height?: number;
}

/**
 * Resolve a user-provided format input into concrete dimensions + intent.
 * Preset wins over width/height. Custom width/height must be 100-10000px;
 * out-of-range values are dropped silently.
 *
 * Returns an empty object for `letter` (or undefined input) so callers can
 * spread the result without setting `metadata.format`.
 */
export function resolveFormat(input?: FormatInput): {
  format?: { width: number; height: number };
  intent?: Intent;
} {
  if (!input) return {};

  if (input.preset) {
    const dims = SOCIAL_PRESETS[input.preset];
    if (!dims) return {}; // letter
    return { format: { ...dims }, intent: detectIntent(dims) };
  }

  if (typeof input.width === "number" && typeof input.height === "number") {
    if (
      input.width < 100 || input.width > 10000 ||
      input.height < 100 || input.height > 10000
    ) {
      return {};
    }
    const dims = { width: input.width, height: input.height };
    return { format: dims, intent: detectIntent(dims) };
  }

  return {};
}
