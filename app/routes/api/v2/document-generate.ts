import type { Route } from "./+types/document-generate";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import { generateDocument } from "@easybits.cloud/html-tailwind-generator/generateDocument";
import type { Section3 } from "@easybits.cloud/html-tailwind-generator";
import { checkAiGenerationLimit, incrementAiGeneration } from "~/.server/aiGenerationLimit";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const { landingId, prompt, sourceContent, logoUrl, extraInstructions, pageCount } = body;

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
      { error: `Has usado todas tus ${genLimit.limit} generaciones de este mes.` },
      { status: 429 }
    );
  }

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const openaiKey = await resolveAiKey(ctx.user.id, "OPENAI");

  let quotaIncremented = false;

  // Build the prompt combining source content + user instructions
  const parts = [
    sourceContent
      ? `Transform this content into beautiful document pages:\n\n${sourceContent.substring(0, 15000)}`
      : "Create a professional document",
    prompt ? `\nInstructions: ${prompt}` : "",
    pageCount
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
        await generateDocument({
          anthropicApiKey: userKey || undefined,
          openaiApiKey: openaiKey || undefined,
          prompt: parts,
          logoUrl: logoUrl || undefined,
          extraInstructions: extraInstructions || undefined,
          pexelsApiKey: process.env.PEXELS_API_KEY,
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
            if (logoUrl) partial = partial.replaceAll("__LOGO_URL__", logoUrl);
            if (partial.length > 20) {
              send("section-building", { html: partial, order: completedCount });
            }
          },
          async onSection(section) {
            if (logoUrl) section.html = section.html.replaceAll("__LOGO_URL__", logoUrl);
            if (!quotaIncremented) {
              quotaIncremented = true;
              await incrementAiGeneration(ctx.user.id);
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
              await db.landing.update({
                where: { id: landingId },
                data: { sections: allSections as any },
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
