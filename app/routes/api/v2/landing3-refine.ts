import type { Route } from "./+types/landing3-refine";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import { enrichImages } from "~/.server/images/enrichImages";
import type { Section3 } from "~/lib/landing3/types";

const REFINE_SYSTEM = `You are an expert HTML/Tailwind CSS developer. You receive the current HTML of a landing page section and a user instruction.

RULES:
- Return ONLY the modified HTML — no full page, no <html>/<head>/<body> tags
- Use Tailwind CSS classes (CDN loaded)
- You may use inline styles for specific adjustments
- Images: use data-image-query="english search query" for new images
- Keep all text in its original language unless asked to translate
- Be creative — don't just make minimal changes, improve the design
- Return raw HTML only — no markdown fences, no explanations

COLOR SYSTEM — CRITICAL:
- Use semantic color classes: bg-primary, text-primary, bg-primary-light, bg-primary-dark, text-on-primary, bg-surface, bg-surface-alt, text-on-surface, text-on-surface-muted, bg-secondary, text-secondary, bg-accent, text-accent
- NEVER use hardcoded Tailwind color classes like bg-indigo-600, text-blue-500, etc.
- Only use gray-* for subtle borders/dividers. All main colors MUST use semantic tokens.

TAILWIND v3 NOTES:
- Standard Tailwind v3 classes (shadow-sm, shadow-md, rounded-md, etc.)
- Borders: border + border-gray-200 for visible borders`;

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json();
  const { landingId, sectionId, instruction, currentHtml, referenceImage } =
    body;

  if (!landingId || !sectionId || !instruction) {
    return Response.json(
      { error: "landingId, sectionId, and instruction required" },
      { status: 400 }
    );
  }

  const landing = await db.landing.findUnique({ where: { id: landingId } });
  if (!landing || landing.ownerId !== ctx.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const sections = (landing.sections || []) as unknown as Section3[];
  const isNewSection = sectionId === "__new__";
  const section = isNewSection ? null : sections.find((s) => s.id === sectionId);
  if (!isNewSection && !section) {
    return Response.json({ error: "Section not found" }, { status: 404 });
  }

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const anthropic = userKey
    ? createAnthropic({ apiKey: userKey })
    : createAnthropic();

  // Use Haiku for speed — refine/variant is a focused HTML edit, not complex generation
  const model = referenceImage
    ? anthropic("claude-sonnet-4-6") // Vision needs Sonnet for quality
    : anthropic("claude-haiku-4-5-20251001");

  // Build content (supports multimodal with reference image)
  const content: any[] = [];
  if (referenceImage) {
    content.push({ type: "image", image: referenceImage });
  }
  content.push({
    type: "text",
    text: `Current HTML:\n${currentHtml || section?.html || "<section></section>"}\n\nInstruction: ${instruction}\n\nReturn the updated HTML.`,
  });

  const result = streamText({
    model,
    system: REFINE_SYSTEM,
    messages: [{ role: "user", content }],
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        let accumulated = "";

        for await (const chunk of result.textStream) {
          accumulated += chunk;
          send("chunk", { html: accumulated });
        }

        // Clean up markdown fences if present
        let html = accumulated.trim();
        if (html.startsWith("```")) {
          html = html.replace(/^```(?:html|xml)?\s*/, "").replace(/\s*```$/, "");
        }

        // Enrich images
        html = await enrichImages(html);

        // Update section in DB (skip for new sections — editor handles that)
        if (!isNewSection) {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              // Re-read sections to avoid stale data overwrites
              const fresh = await db.landing.findUnique({ where: { id: landingId } });
              const freshSections = (fresh?.sections || []) as unknown as Section3[];
              const updatedSections = freshSections.map((s) =>
                s.id === sectionId ? { ...s, html } : s
              );
              await db.landing.update({
                where: { id: landingId },
                data: { sections: updatedSections as any },
              });
              break;
            } catch (err: any) {
              if (err?.code === "P2034" && attempt < 2) continue;
              throw err;
            }
          }
        }

        send("done", { html });
        controller.close();
      } catch (err: any) {
        send("error", { message: err.message || "Refine failed" });
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
