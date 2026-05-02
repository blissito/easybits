import { LANDING_THEMES } from "@easybits.cloud/html-tailwind-generator";
import type { Landing } from "@prisma/client";
import { db } from "./db";

export type ThemePalette = Record<string, string>;

/**
 * Map legacy customColors shapes (saved by older versions of `applyBrandKit`)
 * to the canonical `{ primary, secondary, accent, surface }` keys that
 * `buildCustomTheme` expects. Without this, docs created before the
 * applyBrandKit fix have `bg`/`surfaceAlt`/`text` keys and `surface` is
 * undefined, so screenshots render with a white fallback theme.
 */
function normalizeCustomColorsShape(input: Record<string, unknown>): ThemePalette {
  const out: ThemePalette = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string") out[k] = v;
  }
  // Legacy aliases → canonical
  if (!out.surface && typeof out.bg === "string") out.surface = out.bg;
  if (!out.secondary && typeof out.surfaceAlt === "string") out.secondary = out.surfaceAlt;
  if (!out["surface-alt"] && typeof out.surfaceAlt === "string") out["surface-alt"] = out.surfaceAlt;
  return out;
}

function isHex(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v);
}

/**
 * Synchronous palette resolution. Reads only from the landing record itself.
 * Use `resolveLandingPaletteWithBrandKit` when you can pay the extra DB hit
 * (screenshot pipeline) and want the brand-kit fallback.
 */
export function resolveLandingPalette(landing: Landing): ThemePalette | undefined {
  const meta = (landing.metadata as Record<string, unknown> | null) || {};
  const themeName = landing.theme || (meta.theme as string | undefined);

  if (themeName === "custom") {
    const stored = (landing.customColors as Record<string, unknown> | null)
      ?? (meta.customColors as Record<string, unknown> | undefined);
    if (stored && typeof stored === "object" && Object.keys(stored).length > 0) {
      const normalized = normalizeCustomColorsShape(stored);
      if (Object.values(normalized).some(isHex)) return normalized;
    }
  }

  if (themeName) {
    const builtIn = LANDING_THEMES.find((t) => t.id === themeName);
    if (builtIn) {
      const out: ThemePalette = {};
      for (const [k, v] of Object.entries(builtIn.colors)) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    }
  }

  const direction = meta.direction as { colors?: Record<string, unknown> } | undefined;
  if (direction?.colors) {
    const out = normalizeCustomColorsShape(direction.colors);
    if (Object.values(out).some(isHex)) return out;
  }

  return undefined;
}

/**
 * Like `resolveLandingPalette`, but if the landing has `metadata.brandKitId`
 * and the local palette is missing/incomplete, loads the BrandKit from the DB
 * and synthesizes the palette from its colors. Use this in export pipelines
 * (screenshots, PDFs) where landing.customColors may be stale or absent.
 */
export async function resolveLandingPaletteWithBrandKit(
  landing: Landing
): Promise<ThemePalette | undefined> {
  const local = resolveLandingPalette(landing);
  if (local && isHex(local.surface) && isHex(local.primary)) return local;

  const meta = (landing.metadata as Record<string, unknown> | null) || {};
  const brandKitId = meta.brandKitId as string | undefined;
  if (!brandKitId) return local;

  const kit = await db.brandKit.findUnique({ where: { id: brandKitId } });
  if (!kit || kit.ownerId !== landing.ownerId) return local;

  const colors = (kit.colors as Record<string, unknown>) || {};
  const synthesized = normalizeCustomColorsShape(colors);
  // Prefer local values where present; fall back to brand kit for missing roles.
  return { ...synthesized, ...(local || {}) };
}
