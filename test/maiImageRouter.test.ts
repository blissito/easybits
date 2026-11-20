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

describe("OpenAI → MAI 2.7 fallback", () => {
  it("falls back to MAI 2.7 when OpenAI has no credit, and bills MAI", async () => {
    const { runImageWithFallback, maiCostCredits } = await import("~/.server/services/providers/mai");
    const { ServiceProviderError } = await import("~/.server/services/errors");
    const calls: string[] = [];
    const run = await runImageWithFallback(
      { serviceId: "image.openai.generate", input: { prompt: "x" } },
      { serviceId: "image.mai.generate", input: { prompt: "x", tier: "full" } },
      async (sid) => {
        calls.push(sid);
        if (sid === "image.openai.generate") throw new ServiceProviderError(sid, 400, "credit_balance_exhausted");
        return { data: { modelId: "microsoft/mai-image-2.7/text-to-image" } };
      },
    );
    expect(calls).toEqual(["image.openai.generate", "image.mai.generate"]);
    expect(run.fellBack).toBe(true);
    expect(run.result.data.modelId).toBe("microsoft/mai-image-2.7/text-to-image");
    expect(getService(run.plan.serviceId)!.estimateCost(run.plan.input as never)).toBe(maiCostCredits({ tier: "full" }));
    expect(maiCostCredits({ tier: "full" })).toBe(100);
  });

  it.each([[429, "rate"], [503, "down"], [400, "insufficient_quota"]])("treats %s %s as outage", async (status, msg) => {
    const { isOpenaiOutage } = await import("~/.server/services/providers/mai");
    const { ServiceProviderError } = await import("~/.server/services/errors");
    expect(isOpenaiOutage(new ServiceProviderError("image.openai.generate", status, msg))).toBe(true);
  });

  it("does not fall back on prompt errors", async () => {
    const { runImageWithFallback } = await import("~/.server/services/providers/mai");
    const { ServiceProviderError } = await import("~/.server/services/errors");
    await expect(runImageWithFallback(
      { serviceId: "image.openai.generate", input: {} },
      { serviceId: "image.mai.generate", input: {} },
      async (sid) => { throw new ServiceProviderError(sid, 400, "content policy"); },
    )).rejects.toThrow("content policy");
  });

  it("calculator image price matches what the final tool charges", async () => {
    const { COST_IMAGE } = await import("~/lib/credits");
    expect(COST_IMAGE).toBe(openaiImageService.estimateCost({ prompt: "x", quality: "low" } as never));
    expect(COST_IMAGE).toBe(maiCostCredits({ tier: "full" }));
  });
});
