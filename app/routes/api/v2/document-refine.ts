import type { Route } from "./+types/document-refine";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { Section3 } from "~/lib/landing3/types";
import { checkAiGenerationLimit, incrementAiGeneration } from "~/.server/aiGenerationLimit";

const REFINE_SYSTEM_PROMPT = `You are a professional document designer. You refine HTML content for letter-sized (8.5" × 11") document pages.

CRITICAL PRIORITY RULES — SURGICAL EDITS:
- Make the SMALLEST possible change to fulfill the instruction
- If the instruction mentions a specific element (circles, dots, header, logo, icon, chart, etc.), find that exact element and modify ONLY it
- Do NOT change layout, colors, typography, structure, or content that the instruction does not mention
- The output HTML must be 90%+ identical to the input — only the targeted element should differ
- NEVER rewrite the entire page for a small change request
- Keep all existing classes, inline styles, and structure intact unless the instruction explicitly asks to change them

GENERAL RULES:
- Output ONLY the refined HTML <section>...</section> — no markdown, no explanation
- Keep content within page boundaries (7" × 9.5" effective area with 0.75" margins)
- Use Tailwind CSS classes for styling
- Maintain professional, colorful design with geometric elements, gradients, SVG icons
- For charts and data visualization, use pure CSS bars/progress elements or inline SVG — NEVER use Chart.js or canvas
- NEVER use emojis anywhere — use SVG icons or geometric shapes instead
- Ensure strong contrast: dark text on light backgrounds, light text on dark backgrounds`;

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
  const section = isNewSection
    ? null
    : sections.find((s) => s.id === sectionId);
  if (!isNewSection && !section) {
    return Response.json({ error: "Section not found" }, { status: 404 });
  }

  // Check AI generation limit
  const genLimit = await checkAiGenerationLimit(ctx.user.id);
  if (!genLimit.allowed) {
    return Response.json(
      { error: `Límite de generaciones AI alcanzado (${genLimit.used}/${genLimit.limit}). Upgrade tu plan para más.` },
      { status: 429 }
    );
  }
  await incrementAiGeneration(ctx.user.id);

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const anthropic = createAnthropic({ apiKey: userKey || undefined });

  const messages: any[] = [];
  if (referenceImage) {
    // Convert data URL to Uint8Array for AI SDK
    const base64Match = referenceImage.match(/^data:([^;]+);base64,(.+)$/);
    const imageContent = base64Match
      ? { type: "image" as const, image: new Uint8Array(Buffer.from(base64Match[2], "base64")), mimeType: base64Match[1] }
      : { type: "image" as const, image: referenceImage };
    messages.push({
      role: "user",
      content: [
        imageContent,
        {
          type: "text",
          text: `Current HTML:\n${currentHtml || section?.html || "<section></section>"}\n\nInstruction: ${instruction}\n\nUse the image as design reference. Output ONLY the refined <section> HTML.`,
        },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: `Current HTML:\n${currentHtml || section?.html || "<section></section>"}\n\nInstruction: ${instruction}\n\nOutput ONLY the refined <section> HTML.`,
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: any) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const model = referenceImage
          ? "claude-sonnet-4-6"
          : "claude-haiku-4-5-20251001";

        const result = streamText({
          model: anthropic(model),
          system: REFINE_SYSTEM_PROMPT,
          messages,
          maxTokens: 4000,
        });

        let fullHtml = "";

        for await (const chunk of result.textStream) {
          fullHtml += chunk;

          // Extract <section>...</section> if present
          const sectionMatch = fullHtml.match(
            /<section[\s\S]*<\/section>/i
          );
          if (sectionMatch) {
            send("chunk", { html: sectionMatch[0] });
          }
        }

        // Final extraction
        const finalMatch = fullHtml.match(/<section[\s\S]*<\/section>/i);
        const finalHtml = finalMatch ? finalMatch[0] : fullHtml;

        // Update DB (skip for new sections)
        if (!isNewSection) {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const fresh = await db.landing.findUnique({
                where: { id: landingId },
              });
              const freshSections =
                (fresh?.sections || []) as unknown as Section3[];
              const updatedSections = freshSections.map((s) =>
                s.id === sectionId ? { ...s, html: finalHtml } : s
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

        send("done", { html: finalHtml });
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
