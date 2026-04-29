import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "~/.server/core/documentOperations";

const LETTER_BASE = `You are a professional document designer. You refine HTML content for letter-sized (8.5" × 11") document pages.

GENERAL RULES:
- Page structure: <section class="w-[8.5in] h-[11in] flex flex-col relative overflow-hidden">
- The section is EXACTLY 11in tall — content MUST fit, never exceed
- Keep content within page boundaries (7" × 9.5" effective area with 0.75" margins)`;

describe("buildSystemPrompt", () => {
  it("returns base prompt unchanged for letter (no format, not web)", () => {
    const result = buildSystemPrompt(LETTER_BASE, undefined, undefined, false);
    expect(result).toBe(LETTER_BASE);
    expect(result).toContain("8.5\" × 11\"");
    expect(result).toContain("w-[8.5in] h-[11in]");
  });

  it("applies web mode swap when isWeb=true and no docFormat", () => {
    const result = buildSystemPrompt(LETTER_BASE, undefined, undefined, true);
    expect(result).not.toContain("8.5\" × 11\"");
    expect(result).not.toContain("w-[8.5in] h-[11in]");
    expect(result).toContain("web-optimized");
    expect(result).toContain("w-[1280px]");
  });

  it("rewrites section size to pixels for IG Story (1080×1920) + adds FULL-BLEED block", () => {
    const result = buildSystemPrompt(
      LETTER_BASE,
      { width: 1080, height: 1920 },
      "social",
      false,
    );
    expect(result).toContain("w-[1080px] h-[1920px]");
    expect(result).not.toContain("w-[8.5in] h-[11in]");
    expect(result).toContain("1080×1920px");
    expect(result).toContain("FULL-BLEED");
    expect(result).toContain("EDGE-TO-EDGE");
    expect(result).toContain("9:16 vertical");
  });

  it("rewrites for IG feed 4:5 (1080×1350) with social intent", () => {
    const result = buildSystemPrompt(
      LETTER_BASE,
      { width: 1080, height: 1350 },
      "social",
      false,
    );
    expect(result).toContain("w-[1080px] h-[1350px]");
    expect(result).toContain("1080×1350px");
    expect(result).toContain("FULL-BLEED");
  });

  it("rewrites for square (1080×1080) with social intent", () => {
    const result = buildSystemPrompt(
      LETTER_BASE,
      { width: 1080, height: 1080 },
      "social",
      false,
    );
    expect(result).toContain("w-[1080px] h-[1080px]");
    expect(result).toContain("FULL-BLEED");
  });

  it("rewrites for presentation 16:9 (1920×1080) with presentation intent", () => {
    const result = buildSystemPrompt(
      LETTER_BASE,
      { width: 1920, height: 1080 },
      "presentation",
      false,
    );
    expect(result).toContain("w-[1920px] h-[1080px]");
    expect(result).toContain("PRESENTATION SLIDE");
    expect(result).not.toContain("EDGE-TO-EDGE");
  });

  it("rewrites size but skips social/presentation block when intent is undefined", () => {
    const result = buildSystemPrompt(
      LETTER_BASE,
      { width: 1200, height: 1500 },
      undefined,
      false,
    );
    expect(result).toContain("w-[1200px] h-[1500px]");
    expect(result).not.toContain("EDGE-TO-EDGE");
    expect(result).not.toContain("PRESENTATION SLIDE");
  });

  it("docFormat takes precedence over isWeb flag", () => {
    const result = buildSystemPrompt(
      LETTER_BASE,
      { width: 1080, height: 1920 },
      "social",
      true,
    );
    expect(result).toContain("w-[1080px] h-[1920px]");
    expect(result).not.toContain("w-[1280px]");
    expect(result).toContain("FULL-BLEED");
  });

  it("replaces height-fit instruction with the new pixel height", () => {
    const result = buildSystemPrompt(
      LETTER_BASE,
      { width: 1080, height: 1920 },
      "social",
      false,
    );
    expect(result).toContain("EXACTLY 1920px tall");
    expect(result).not.toContain("EXACTLY 11in tall");
  });
});
