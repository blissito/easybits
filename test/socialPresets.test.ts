import { describe, it, expect } from "vitest";
import {
  SOCIAL_PRESETS,
  SOCIAL_PRESET_KEYS,
  detectIntent,
  resolveFormat,
} from "~/.server/core/socialPresets";

describe("socialPresets", () => {
  describe("SOCIAL_PRESETS registry", () => {
    it("includes the social formats Ghosty needs", () => {
      expect(SOCIAL_PRESETS["ig-feed"]).toEqual({ width: 1080, height: 1350 });
      expect(SOCIAL_PRESETS["ig-story"]).toEqual({ width: 1080, height: 1920 });
      expect(SOCIAL_PRESETS["ig-square"]).toEqual({ width: 1080, height: 1080 });
      expect(SOCIAL_PRESETS["wsp-status"]).toEqual({ width: 1080, height: 1920 });
      expect(SOCIAL_PRESETS["tiktok"]).toEqual({ width: 1080, height: 1920 });
      expect(SOCIAL_PRESETS["slide-16-9"]).toEqual({ width: 1920, height: 1080 });
    });

    it("preserves legacy aliases for open_design_in_editor", () => {
      expect(SOCIAL_PRESETS["1080x1080"]).toEqual({ width: 1080, height: 1080 });
      expect(SOCIAL_PRESETS["1080x1350"]).toEqual({ width: 1080, height: 1350 });
    });

    it("letter resolves to undefined (no metadata.format)", () => {
      expect(SOCIAL_PRESETS["letter"]).toBeUndefined();
    });

    it("exposes preset keys for zod enum", () => {
      expect(SOCIAL_PRESET_KEYS).toContain("ig-feed");
      expect(SOCIAL_PRESET_KEYS).toContain("letter");
      expect(SOCIAL_PRESET_KEYS.length).toBeGreaterThan(5);
    });
  });

  describe("detectIntent", () => {
    it("returns 'document' for undefined format", () => {
      expect(detectIntent(undefined)).toBe("document");
    });

    it("returns 'social' for square (1:1)", () => {
      expect(detectIntent({ width: 1080, height: 1080 })).toBe("social");
    });

    it("returns 'social' for 4:5 portrait", () => {
      expect(detectIntent({ width: 1080, height: 1350 })).toBe("social");
    });

    it("returns 'social' for 9:16 vertical (Stories)", () => {
      expect(detectIntent({ width: 1080, height: 1920 })).toBe("social");
    });

    it("returns 'presentation' for 16:9 landscape", () => {
      expect(detectIntent({ width: 1920, height: 1080 })).toBe("presentation");
    });

    it("returns 'document' for letter-ish ratio", () => {
      expect(detectIntent({ width: 816, height: 1056 })).toBe("document");
    });
  });

  describe("resolveFormat", () => {
    it("returns empty object for undefined input", () => {
      expect(resolveFormat(undefined)).toEqual({});
    });

    it("preset 'ig-feed' resolves to 1080×1350 + social intent", () => {
      const r = resolveFormat({ preset: "ig-feed" });
      expect(r.format).toEqual({ width: 1080, height: 1350 });
      expect(r.intent).toBe("social");
    });

    it("preset 'ig-story' resolves to 1080×1920 + social intent", () => {
      const r = resolveFormat({ preset: "ig-story" });
      expect(r.format).toEqual({ width: 1080, height: 1920 });
      expect(r.intent).toBe("social");
    });

    it("preset 'slide-16-9' resolves to 1920×1080 + presentation intent", () => {
      const r = resolveFormat({ preset: "slide-16-9" });
      expect(r.format).toEqual({ width: 1920, height: 1080 });
      expect(r.intent).toBe("presentation");
    });

    it("preset 'letter' returns empty (default Letter path)", () => {
      expect(resolveFormat({ preset: "letter" })).toEqual({});
    });

    it("custom width/height passes through with inferred intent", () => {
      const r = resolveFormat({ width: 1200, height: 1500 });
      expect(r.format).toEqual({ width: 1200, height: 1500 });
      expect(r.intent).toBe("social"); // 4:5
    });

    it("preset wins over custom width/height", () => {
      const r = resolveFormat({ preset: "ig-square", width: 9999, height: 9999 });
      expect(r.format).toEqual({ width: 1080, height: 1080 });
      expect(r.intent).toBe("social");
    });

    it("out-of-range custom dimensions are dropped", () => {
      expect(resolveFormat({ width: 50, height: 50 })).toEqual({});
      expect(resolveFormat({ width: 99999, height: 99999 })).toEqual({});
    });

    it("legacy alias 1080x1080 still resolves to the same dims", () => {
      expect(resolveFormat({ preset: "1080x1080" }).format).toEqual({ width: 1080, height: 1080 });
      expect(resolveFormat({ preset: "1080x1350" }).format).toEqual({ width: 1080, height: 1350 });
    });
  });
});
