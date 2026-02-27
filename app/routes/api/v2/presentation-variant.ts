import type { Route } from "./+types/presentation-variant";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";

// POST /api/v2/presentations/:id/variant
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const presentation = await db.presentation.findUnique({
    where: { id: params.id },
  });
  if (!presentation || presentation.ownerId !== ctx.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { slideIndex, instruction } = body as {
    slideIndex: number;
    instruction?: string;
  };

  const slides = (presentation.slides as any[]) || [];
  if (slideIndex < 0 || slideIndex >= slides.length) {
    return Response.json({ error: "Invalid slide index" }, { status: 400 });
  }

  const currentSlide = slides[slideIndex];
  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const anthropic = userKey
    ? createAnthropic({ apiKey: userKey })
    : createAnthropic();

  try {
    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: z.object({
        html: z.string().describe("Alternative HTML for the slide"),
      }),
      system: `You are a presentation designer. Generate an alternative version of a reveal.js slide.
Use varied layouts: columns, stat grids, blockquotes, images.
Use ONLY these CSS classes (NEVER inline styles): .columns, .col, .stat-grid, .stat, .accent, .img-right, .img-left, .quote-slide, .centered, .three-bg.
NEVER use style="" attributes. Reveal.js handles font sizes, padding, backgrounds, and scaling automatically.
Keep content SHORT — max 6 lines. Output ONLY the inner HTML of a <section> tag.`,
      prompt: `Current slide HTML:\n${currentSlide.html}\n\nPresentation topic: ${presentation.prompt}\n${instruction ? `User instruction: ${instruction}` : "Make it visually different."}`,
    });

    return Response.json({ html: object.html });
  } catch (err: any) {
    console.error("Variant generation error:", err);
    return Response.json(
      { error: err.message || "Failed to generate variant" },
      { status: 500 }
    );
  }
}
