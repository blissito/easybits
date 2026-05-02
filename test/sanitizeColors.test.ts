import { describe, it, expect } from "vitest";
import { sanitizeSemanticColors } from "../packages/html-tailwind-generator/src/sanitizeColors";
import { sanitizeSemanticColors as sanitizeAppCopy } from "../app/.server/sanitizeColors";

describe("sanitizeSemanticColors — arbitrary values", () => {
  it("rewrites bg-[#hex] to bg-primary using HSL fallback for warm hex", () => {
    const html = `<section class="bg-[#ff5544] py-8"><p>x</p></section>`;
    const out = sanitizeSemanticColors(html);
    expect(out).toContain("bg-primary");
    expect(out).not.toContain("bg-[#");
  });

  it("rewrites bg-[#hex] to bg-secondary for cool blue hex", () => {
    const html = `<section class="bg-[#3344ff] py-8"></section>`;
    const out = sanitizeSemanticColors(html);
    expect(out).toContain("bg-secondary");
    expect(out).not.toContain("bg-[#");
  });

  it("rewrites bg-[#hex] to bg-accent for green hex", () => {
    const html = `<section class="bg-[#22cc66] py-8"></section>`;
    const out = sanitizeSemanticColors(html);
    expect(out).toContain("bg-accent");
  });

  it("uses theme palette when provided (RGB nearest beats HSL bucket)", () => {
    // #9a99ea is a violet — HSL fallback would say "secondary", but if it's
    // the user's CUSTOM primary, the palette must override.
    const html = `<section class="bg-[#9a99ea]"></section>`;
    const palette = { primary: "#9a99ea", secondary: "#ff0000", accent: "#00ff00", surface: "#ffffff" };
    const out = sanitizeSemanticColors(html, palette);
    expect(out).toContain("bg-primary");
  });

  it("preserves opacity suffix on arbitrary values", () => {
    const html = `<div class="bg-[#9a99ea]/50"></div>`;
    const out = sanitizeSemanticColors(html, { primary: "#9a99ea" });
    expect(out).toContain("bg-primary/50");
  });

  it("rewrites hover: variant", () => {
    const html = `<button class="hover:bg-[#9a99ea]"></button>`;
    const out = sanitizeSemanticColors(html, { primary: "#9a99ea" });
    expect(out).toContain("hover:bg-primary");
  });

  it("rewrites text-[#hex] to text-on-surface family via walker", () => {
    const html = `<div class="bg-surface"><p class="text-[#333333]">copy</p></div>`;
    const out = sanitizeSemanticColors(html);
    expect(out).not.toContain("text-[#");
    // walker should resolve seeded marker against bg-surface ancestor
    expect(out).toMatch(/text-on-surface(?:-muted)?/);
  });

  it("rewrites text-[#hex] inside bg-primary to text-on-primary", () => {
    const html = `<section class="bg-primary"><p class="text-[#ffffff]">x</p></section>`;
    const out = sanitizeSemanticColors(html);
    expect(out).toContain("text-on-primary");
    expect(out).not.toContain("text-[#");
  });

  it("rewrites gradient stops from-[#hex] to-[#hex]", () => {
    const html = `<div class="bg-gradient-to-r from-[#9a99ea] to-[#22cc66]"></div>`;
    const palette = { primary: "#9a99ea", accent: "#22cc66", secondary: "#0000ff", surface: "#fff" };
    const out = sanitizeSemanticColors(html, palette);
    expect(out).toContain("from-primary");
    expect(out).toContain("to-accent");
  });

  it("supports 3-char hex shorthand", () => {
    const html = `<div class="bg-[#f00]"></div>`;
    const out = sanitizeSemanticColors(html);
    expect(out).toContain("bg-primary");
    expect(out).not.toContain("bg-[#");
  });

  it("supports 8-char hex (drops alpha channel)", () => {
    const html = `<div class="bg-[#9a99ea80]"></div>`;
    const out = sanitizeSemanticColors(html, { primary: "#9a99ea" });
    expect(out).toContain("bg-primary");
  });

  it("does not touch non-chromatic arbitrary values (e.g. arbitrary px)", () => {
    const html = `<div class="w-[120px] h-[64px] bg-primary"></div>`;
    const out = sanitizeSemanticColors(html);
    expect(out).toContain("w-[120px]");
    expect(out).toContain("h-[64px]");
  });

  it("rewrites multiple chromatic utilities in a single class string", () => {
    const html = `<div class="bg-[#ff0000] border-[#00ff00] ring-[#0000ff] text-[#222222]"></div>`;
    const out = sanitizeSemanticColors(html);
    expect(out).toContain("bg-primary");
    expect(out).toContain("border-accent");
    expect(out).toContain("ring-secondary");
    expect(out).not.toMatch(/-\[#/);
  });

  it("preserves existing semantic classes when arbitrary values are also present", () => {
    const html = `<div class="bg-surface"><span class="text-[#abc123]">x</span></div>`;
    const out = sanitizeSemanticColors(html);
    expect(out).toContain("bg-surface");
  });
});

describe("sanitizeSemanticColors — regression (existing behavior)", () => {
  it("still rewrites bg-blue-500 to bg-secondary", () => {
    const html = `<div class="bg-blue-500"></div>`;
    const out = sanitizeSemanticColors(html);
    expect(out).toContain("bg-secondary");
  });

  it("still rewrites bg-white to bg-surface", () => {
    const html = `<div class="bg-white"></div>`;
    const out = sanitizeSemanticColors(html);
    expect(out).toContain("bg-surface");
  });

  it("still resolves text-white inside bg-primary to text-on-primary", () => {
    const html = `<section class="bg-primary"><p class="text-white">x</p></section>`;
    const out = sanitizeSemanticColors(html);
    expect(out).toContain("text-on-primary");
  });
});

describe("sanitizeSemanticColors — surface-deep walker behavior", () => {
  it("rewrites text-on-primary inside bg-surface-deep to text-on-surface-deep", () => {
    const html = `<section class="bg-surface-deep p-8"><h2 class="text-on-primary">Card</h2></section>`;
    const out = sanitizeSemanticColors(html);
    expect(out).toContain("text-on-surface-deep");
    expect(out).not.toMatch(/text-on-primary\b/);
  });

  it("rewrites text-on-surface inside bg-surface-deep to text-on-surface-deep (avoid dark-on-dark)", () => {
    const html = `<section class="bg-surface-deep"><p class="text-on-surface">body</p></section>`;
    const out = sanitizeSemanticColors(html);
    expect(out).toContain("text-on-surface-deep");
  });

  it("does NOT rewrite text-on-surface-muted inside bg-surface (already correct)", () => {
    const html = `<section class="bg-surface"><p class="text-on-surface-muted">body</p></section>`;
    const out = sanitizeSemanticColors(html);
    expect(out).toContain("text-on-surface-muted");
  });

  it("rewrites text-on-primary inside bg-surface-alt to text-on-surface (the AGENT BUG case)", () => {
    // The classic agent failure: thinking surface-alt is a dark surface and pairing
    // with text-on-primary (white). Output: white-on-near-white. Sanitizer must
    // detect surface-alt as the surface family and rewrite.
    const html = `<div class="bg-surface-alt p-4"><p class="text-on-primary">copy</p></div>`;
    const out = sanitizeSemanticColors(html);
    expect(out).toContain("text-on-surface");
    expect(out).not.toMatch(/text-on-primary\b/);
  });
});

describe("buildThemePromptContext — custom theme branch", () => {
  it("emits hex values when themeName is custom and customColors provided", async () => {
    const { buildThemePromptContext } = await import("../packages/html-tailwind-generator/src/themes");
    const out = buildThemePromptContext("custom", {
      primary: "#9a99ea",
      accent: "#22cc66",
      surface: "#ffffff",
    });
    expect(out).toContain("CUSTOM theme");
    expect(out).toContain("primary: #9a99ea");
    expect(out).toContain("accent: #22cc66");
    expect(out).toContain("SEMANTIC CLASS");
    expect(out).toContain("NEVER the hex");
  });

  it("uses LANDING_THEMES lookup for built-in theme names", async () => {
    const { buildThemePromptContext } = await import("../packages/html-tailwind-generator/src/themes");
    const out = buildThemePromptContext("minimal");
    expect(out).toContain('Active theme: "minimal"');
    expect(out).toContain("Actual color values for this theme");
  });

  it("custom theme without palette emits only base description (no hex lines)", async () => {
    const { buildThemePromptContext } = await import("../packages/html-tailwind-generator/src/themes");
    const out = buildThemePromptContext("custom");
    expect(out).toContain('Active theme: "custom"');
    expect(out).not.toContain("CUSTOM theme (user-picked)");
  });

  it("ignores invalid hex values in customColors", async () => {
    const { buildThemePromptContext } = await import("../packages/html-tailwind-generator/src/themes");
    const out = buildThemePromptContext("custom", {
      primary: "#9a99ea",
      accent: "not-a-hex",
      surface: "rgb(255,255,255)",
    });
    expect(out).toContain("primary: #9a99ea");
    expect(out).not.toContain("not-a-hex");
    expect(out).not.toContain("rgb(255");
  });
});

describe("app/.server/sanitizeColors — fallback copy", () => {
  it("strips bg-[#hex] to bg-primary", () => {
    const out = sanitizeAppCopy(`<div class="bg-[#9a99ea] py-4"></div>`);
    expect(out).toContain("bg-primary");
    expect(out).not.toContain("bg-[#");
  });

  it("strips text-[#hex] to text-on-surface", () => {
    const out = sanitizeAppCopy(`<p class="text-[#222222]">x</p>`);
    expect(out).toContain("text-on-surface");
    expect(out).not.toContain("text-[#");
  });

  it("preserves opacity suffix on arbitrary bg", () => {
    const out = sanitizeAppCopy(`<div class="bg-[#9a99ea]/50"></div>`);
    expect(out).toContain("bg-primary/50");
  });

  it("preserves arbitrary non-chromatic values (sizing)", () => {
    const out = sanitizeAppCopy(`<div class="w-[120px] bg-[#abc] text-white"></div>`);
    expect(out).toContain("w-[120px]");
    expect(out).toContain("bg-primary");
  });
});

