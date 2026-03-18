import type { Route } from "./+types/document-generate";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import { generateDocumentParallel } from "@easybits.cloud/html-tailwind-generator/generateDocument";
import type { Section3 } from "@easybits.cloud/html-tailwind-generator";
import { checkAiGenerationLimit, incrementAiGeneration } from "~/.server/aiGenerationLimit";
import { getAiModel, resolveModelLocal } from "~/.server/aiModels";
import { uploadLogoToStorage } from "~/.server/core/documentOperations";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const { landingId, prompt, sourceContent, logoUrl, extraInstructions, pageCount, direction, skipCover, referenceImage, referencePages, pageFormat, brandKitId } = body;

  if (!landingId) {
    return Response.json({ error: "landingId required" }, { status: 400 });
  }

  const landing = await db.landing.findUnique({ where: { id: landingId } });
  if (!landing || landing.ownerId !== ctx.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Check AI generation limit
  const genLimit = await checkAiGenerationLimit(ctx.user.id);
  if (!genLimit.allowed) {
    return Response.json(
      { error: `Has usado todas tus ${genLimit.limit} generaciones de este mes.`, upgradeUrl: "/dash/packs" },
      { status: 429 }
    );
  }

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const openaiKey = await resolveAiKey(ctx.user.id, "OPENAI") || process.env.OPENAI_API_KEY;

  let quotaIncremented = false;
  const startTime = Date.now();
  let usageTokens = { inputTokens: 0, outputTokens: 0 };

  // Resolve brand kit → direction + logo
  let resolvedDirection = direction || undefined;
  let resolvedLogo = logoUrl;
  if (brandKitId && !resolvedDirection) {
    const { getBrandKit, brandKitToDirection } = await import("~/.server/core/brandKitOperations");
    const kit = await getBrandKit(brandKitId, ctx.user.id);
    resolvedDirection = brandKitToDirection(kit);
    if (!resolvedLogo && kit.logoUrl) resolvedLogo = kit.logoUrl;
  }

  // Upload logo to public storage so AI gets a short URL instead of huge data URL
  const resolvedLogoUrl = resolvedLogo ? await uploadLogoToStorage(resolvedLogo, ctx.user.id) : undefined;

  // Build the prompt combining source content + user instructions
  const parts = [
    sourceContent
      ? `Transform this content into beautiful document pages:\n\n${sourceContent.substring(0, 15000)}`
      : "Create a professional document",
    prompt ? `\nInstructions: ${prompt}` : "",
  ].filter(Boolean).join("\n");

  const allSections: Section3[] = [];

  const docModelId = await getAiModel("docGenerate");
  const docModel = resolveModelLocal(docModelId, openaiKey || undefined, userKey || undefined);
  const outlineModelId = await getAiModel("docDirections");
  const outlineModel = resolveModelLocal(outlineModelId, openaiKey || undefined, userKey || undefined);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        await generateDocumentParallel({
          prompt: parts,
          logoUrl: resolvedLogoUrl,
          referenceImage: referenceImage || undefined,
          referencePages: Array.isArray(referencePages) ? referencePages : undefined,
          extraInstructions: extraInstructions || undefined,
          direction: resolvedDirection,
          pexelsApiKey: process.env.PEXELS_API_KEY,
          model: docModel,
          outlineModel,
          pageCount: pageCount ? Number(pageCount) : undefined,
          skipCover: !!skipCover,
          pageFormat: pageFormat || "letter",
          onOutline(outline) {
            send("outline", { pages: outline.pages.map((p) => ({ pageNumber: p.pageNumber, label: p.label, type: p.type })) });
          },
          onPageChunk(pageIndex, html) {
            send("section-building", { html, order: pageIndex });
          },
          async onPageComplete(pageIndex, section) {
            allSections.push(section);
            send("section", section);
          },
          onUsage(usage) {
            usageTokens = usage;
          },
          onImageUpdate(sectionId, html) {
            const s = allSections.find((s) => s.id === sectionId);
            if (s) s.html = html;
            send("section-update", { id: sectionId, html });
          },
          async onDone() {
            if (!quotaIncremented) {
              quotaIncremented = true;
              await incrementAiGeneration(ctx.user.id, undefined, {
                type: "generate",
                product: "document",
                modelId: docModelId,
                inputTokens: usageTokens.inputTokens,
                outputTokens: usageTokens.outputTokens,
                resourceId: landingId,
                pageCount: allSections.length,
                durationMs: Date.now() - startTime,
              });
            }
            if (allSections.length > 0) {
              // Sort by order before saving
              allSections.sort((a, b) => a.order - b.order);
              let finalSections = allSections;
              if (skipCover) {
                const existing = await db.landing.findUnique({ where: { id: landingId }, select: { sections: true } });
                const existingSections = (existing?.sections as any[]) || [];
                finalSections = [...existingSections, ...allSections.map((s, i) => ({ ...s, order: existingSections.length + i }))];
              }
              await db.landing.update({
                where: { id: landingId },
                data: { sections: finalSections as any },
              });
            }
            send("done", { total: allSections.length });
            controller.close();
          },
          onError(err) {
            send("error", { message: err.message || "Generation failed" });
            controller.close();
          },
        });
      } catch (err: any) {
        send("error", { message: err.message || "Generation failed" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
