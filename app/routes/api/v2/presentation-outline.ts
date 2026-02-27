import type { Route } from "./+types/presentation-outline";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { OUTLINE_SYSTEM_PROMPT } from "~/.server/prompts/presentation";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";

// POST /api/v2/presentations/:id/outline
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
  const slideCount = Number(body.slideCount || 8);

  // Resolve AI provider
  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const anthropic = userKey
    ? createAnthropic({ apiKey: userKey })
    : createAnthropic();

  try {
    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: z.object({
        outline: z.array(
          z.object({
            title: z.string(),
            bullets: z.array(z.string()),
            imageQuery: z.string().describe("2-4 English keywords for stock photo search"),
            type: z.enum(["2d", "3d"]).describe("Slide type: 2d for content, 3d for title/closing"),
          })
        ),
      }),
      system: OUTLINE_SYSTEM_PROMPT,
      prompt: `Topic: ${presentation.prompt}\nNumber of slides: ${slideCount}`,
    });

    return Response.json({ outline: object.outline });
  } catch (err: any) {
    console.error("Outline generation error:", err);
    return Response.json(
      { error: err.message || "Failed to generate outline" },
      { status: 500 }
    );
  }
}
