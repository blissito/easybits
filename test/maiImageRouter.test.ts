import { describe, it, expect } from "vitest";
import {
  routeImageModel,
  maiCostCredits,
  maiEndpoint,
  toMaiImageSize,
  maiGenerateService,
  maiEditService,
} from "~/.server/services/providers/mai";
import { openaiImageService } from "~/.server/services/providers/openai";
import { getService } from "~/.server/services/registry";
import { COST_DOC } from "~/lib/credits";
import { IMAGENES_ALLOWLIST } from "~/.server/mcp/toolGroups";

describe("routeImageModel", () => {
  it.each([
    [{}, "mai", "flash"],
    [{ stage: "sketch" as const }, "mai", "flash"],
    [{ transparent: true }, "mai", "full"],
    [{ stage: "final" as const }, "openai", undefined],
    [{ mask: true }, "openai", undefined],
    [{ refs: 5 }, "openai", undefined],
    [{ refs: 4 }, "mai", "flash"],
    [{ quality: "medium" as const }, "openai", undefined],
    [{ quality: "high" as const }, "openai", undefined],
    [{ quality: "low" as const }, "mai", "flash"],
  ])("%j → %s %s", (intent, provider, tier) => {
    const r = routeImageModel(intent);
    expect(r.provider).toBe(provider);
    if (r.provider === "mai") expect(r.tier).toBe(tier);
  });
});

describe("costo MAI en escala COST_DOC", () => {
  it("Flash = 0.25 × COST_DOC y 2.7 = 1 × COST_DOC", () => {
    expect(maiCostCredits({})).toBe(0.25 * COST_DOC);
    expect(maiCostCredits({ tier: "full" })).toBe(COST_DOC);
  });
  it("2K duplica y n multiplica", () => {
    expect(maiCostCredits({ resolution: "2K" })).toBe(0.5 * COST_DOC);
    expect(maiCostCredits({ n: 4 })).toBe(COST_DOC);
  });
  it("Flash cuesta menos que gpt-image-2 low", () => {
    expect(maiGenerateService.estimateCost({ prompt: "x" })).toBeLessThan(
      openaiImageService.estimateCost({ prompt: "x" }),
    );
    expect(maiEditService.estimateCost({ prompt: "x", imageUrls: ["a"] })).toBe(25);
  });
});

describe("endpoints y tamaños", () => {
  it("arma los endpoints de fal", () => {
    expect(maiEndpoint("flash", "generate")).toBe("microsoft/mai-image-2.7/flash/text-to-image");
    expect(maiEndpoint("full", "edit")).toBe("microsoft/mai-image-2.7/edit");
  });
  it("mapea ratios a image_size", () => {
    expect(toMaiImageSize("16:9")).toBe("landscape_16_9");
    expect(toMaiImageSize("9:16")).toBe("portrait_16_9");
    expect(toMaiImageSize("3:4")).toBe("portrait_4_3");
    expect(toMaiImageSize(undefined)).toBe("square_hd");
  });
});

describe("registro", () => {
  it("los servicios MAI están en el registry", () => {
    expect(getService("image.mai.generate")).toBeDefined();
    expect(getService("image.mai.edit")).toBeDefined();
  });
  it("edit_image vuelve a IMAGENES_ALLOWLIST", () => {
    expect(IMAGENES_ALLOWLIST.has("edit_image")).toBe(true);
  });
});
