import type { Route } from "./+types/document-generate";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import { generateDocument } from "@easybits.cloud/html-tailwind-generator/generateDocument";
import type { Section3 } from "@easybits.cloud/html-tailwind-generator";
import { checkAiGenerationLimit, incrementAiGeneration } from "~/.server/aiGenerationLimit";
import { getPlatformDefaultClient, PUBLIC_BUCKET } from "~/.server/storage";
import { getAiModel, resolveModelLocal } from "~/.server/aiModels";

async function uploadLogoToStorage(dataUrl: string, userId: string): Promise<string> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return dataUrl; // already a URL
  const buffer = Buffer.from(match[2], "base64");
  const ext = match[1].includes("png") ? "png" : match[1].includes("svg") ? "svg" : "webp";
  const key = `logos/${userId}/${crypto.randomUUID()}.${ext}`;
  const client = getPlatformDefaultClient({ bucket: PUBLIC_BUCKET });
  const putUrl = await client.getPutUrl(key, { timeout: 60 });
  await fetch(putUrl, {
    method: "PUT",
    body: buffer,
    headers: { "Content-Type": match[1] },
  });
  return `https://${PUBLIC_BUCKET}.fly.storage.tigris.dev/mcp/${key}`;
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const { landingId, prompt, sourceContent, logoUrl, extraInstructions, pageCount, direction, skipCover } = body;

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

  // Upload logo to public storage so AI gets a short URL instead of huge data URL
  const resolvedLogoUrl = logoUrl ? await uploadLogoToStorage(logoUrl, ctx.user.id) : undefined;

  // Build the prompt combining source content + user instructions
  const parts = [
    sourceContent
      ? `Transform this content into beautiful document pages:\n\n${sourceContent.substring(0, 15000)}`
      : "Create a professional document",
    prompt ? `\nInstructions: ${prompt}` : "",
    skipCover
      ? `\nGenerate exactly ${Math.max(1, (pageCount || 5) - 1)} pages. Do NOT generate a cover page — the cover already exists. Start directly with the content pages (page 2 onwards).`
      : pageCount
        ? `\nGenerate exactly ${pageCount} pages.`
        : "\nGenerate 3-8 pages depending on content length.",
  ].filter(Boolean).join("\n");

  const allSections: Section3[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const docModelId = await getAiModel("docGenerate");
        const docModel = resolveModelLocal(docModelId, openaiKey || undefined, userKey || undefined);
        await generateDocument({
          prompt: parts,
          logoUrl: resolvedLogoUrl,
          extraInstructions: extraInstructions || undefined,
          direction: direction || undefined,
          pexelsApiKey: process.env.PEXELS_API_KEY,
          model: docModel,
          onRawChunk(rawBuffer, completedCount) {
            const htmlMatch = rawBuffer.match(/"html"\s*:\s*"([\s\S]*)/);
            if (!htmlMatch) return;
            let partial = htmlMatch[1]
              .replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            if (partial.endsWith('\\')) partial = partial.slice(0, -1);
            // Remove trailing incomplete JSON (quote + possible comma/brace)
            const lastQuote = partial.lastIndexOf('"');
            if (lastQuote > 0) partial = partial.slice(0, lastQuote);
            if (/<section/i.test(partial) && !/<\/section>/i.test(partial)) {
              partial += '</section>';
            }
            if (partial.length > 20) {
              send("section-building", { html: partial, order: completedCount });
            }
          },
          async onSection(section) {
            if (!quotaIncremented) {
              quotaIncremented = true;
              await incrementAiGeneration(ctx.user.id, undefined, { type: "generate", product: "document" });
            }
            allSections.push(section);
            send("section", section);
          },
          onImageUpdate(sectionId, html) {
            const s = allSections.find((s) => s.id === sectionId);
            if (s) s.html = html;
            send("section-update", { id: sectionId, html });
          },
          async onDone() {
            if (allSections.length > 0) {
              // If skipCover, prepend existing sections from DB
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
