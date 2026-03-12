import type { Route } from "./+types/document-directions";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import {
  generateDirections,
  generateHeroPreview,
} from "@easybits.cloud/html-tailwind-generator/directions";
import { enrichImages, findImageSlots } from "@easybits.cloud/html-tailwind-generator/images";
import { getAiModel, resolveModelLocal } from "~/.server/aiModels";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const { prompt, sourceContent, referenceImage } = body;

  if (!prompt) {
    return Response.json({ error: "prompt required" }, { status: 400 });
  }

  const anthropicKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const openaiKey = await resolveAiKey(ctx.user.id, "OPENAI") || process.env.OPENAI_API_KEY;

  const brief = sourceContent
    ? `${prompt}\n\nSource content preview: ${sourceContent.substring(0, 500)}`
    : prompt;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        // Step 1: Generate 4 directions
        const directionsModelId = await getAiModel("docDirections");
        const directionsModel = resolveModelLocal(directionsModelId, openaiKey || undefined, anthropicKey || undefined);
        const directions = await generateDirections({
          prompt: brief,
          count: 4,
          model: directionsModel,
        });
        send("directions", directions);

        // Step 2: Generate 4 cover previews in parallel (Haiku, ~3s)
        const previewModelId = await getAiModel("docDirectionsPreview");
        const previewModel = resolveModelLocal(previewModelId, openaiKey || undefined, anthropicKey || undefined);
        const previewPromises = directions.map((direction, index) =>
          generateHeroPreview({
            prompt: brief,
            direction,
            product: "document",
            model: previewModel,
            referenceImage: referenceImage || undefined,
            onChunk: (partial) => {
              // Strip fake src attrs and send partial for real-time preview
              const cleaned = partial.replace(/<img([^>]*)\ssrc="[^"]*"([^>]*)>/gi, '<img$1$2>');
              send("preview", { index, html: cleaned });
            },
          })
            .then((html) => {
              // Strip fake src attrs
              html = html.replace(/<img([^>]*)\ssrc="[^"]*"([^>]*)>/gi, '<img$1$2>');
              // If img has alt but no data-image-query, add it from alt
              html = html.replace(/<img(?![^>]*data-image-query)([^>]*)\salt="([^"]+)"([^>]*)>/gi,
                '<img$1 alt="$2" data-image-query="$2"$3>');
              send("preview", { index, html });
              return html;
            })
            .catch((err) => {
              console.error(`Preview ${index} failed:`, err.message);
              send("preview", { index, html: "", error: err.message });
              return "";
            })
        );

        const htmlResults = await Promise.all(previewPromises);

        // Enrich images sequentially to avoid Pexels rate limits
        for (let i = 0; i < htmlResults.length; i++) {
          const html = htmlResults[i];
          if (!html) continue;
          const slots = findImageSlots(html);
          if (slots.length === 0) continue;
          try {
            const enriched = await enrichImages(html, {
              pexelsApiKey: process.env.PEXELS_API_KEY,
            });
            send("preview", { index: i, html: enriched });
          } catch {}
        }

        send("done", {});
        controller.close();
      } catch (err: any) {
        send("error", { message: err.message || "Failed to generate directions" });
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
