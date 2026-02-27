import type { Route } from "./+types/presentation-add-slide";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  SLIDES_SYSTEM_PROMPT,
  SCENE_SYSTEM_PROMPT,
} from "~/.server/prompts/presentation";
import { resolveAiKey } from "~/.server/core/aiKeyOperations";
import { SCENE_EFFECT_IDS } from "~/lib/buildRevealHtml";

const sceneEffectSchema = z.object({
  effect: z.enum(SCENE_EFFECT_IDS as unknown as [string, ...string[]]),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  speed: z.number().optional(),
  density: z.number().optional(),
  backgroundColor: z.string().optional(),
});

// POST /api/v2/presentations/:id/add-slide
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
  const { prompt } = body as { prompt: string };

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return Response.json({ error: "Prompt required" }, { status: 400 });
  }

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const anthropic = userKey
    ? createAnthropic({ apiKey: userKey })
    : createAnthropic();

  try {
    // Generate 2x 2D variants + 1x 3D in parallel
    const [variant2D, variant3D] = await Promise.all([
      generateObject({
        model: anthropic("claude-haiku-4-5-20251001"),
        schema: z.object({
          slides: z
            .array(z.string())
            .describe("Two HTML slide variants with different layouts"),
        }),
        system: SLIDES_SYSTEM_PROMPT,
        prompt: `Generate exactly 2 reveal.js HTML slides about: "${prompt.trim()}"\nPresentation topic: ${presentation.prompt}\nUse DIFFERENT layouts for each variant (e.g. one with columns, one with stats or quote).`,
      }),
      generateObject({
        model: anthropic("claude-haiku-4-5-20251001"),
        schema: z.object({
          sceneEffect: sceneEffectSchema,
          title: z.string().optional(),
          subtitle: z.string().optional(),
        }),
        system: SCENE_SYSTEM_PROMPT,
        prompt: `Create a 3D scene for a presentation slide about: "${prompt.trim()}"\nPresentation topic: ${presentation.prompt}`,
      }),
    ]);

    const proposals = [
      // 2D variant A
      {
        id: nanoid(8),
        order: 0,
        type: "2d" as const,
        html: variant2D.object.slides[0] || "",
      },
      // 2D variant B
      {
        id: nanoid(8),
        order: 0,
        type: "2d" as const,
        html: variant2D.object.slides[1] || "",
      },
      // 3D variant
      {
        id: nanoid(8),
        order: 0,
        type: "3d" as const,
        sceneEffect: variant3D.object.sceneEffect,
        title: variant3D.object.title,
        subtitle: variant3D.object.subtitle,
        backgroundColor: variant3D.object.sceneEffect.backgroundColor,
      },
    ];

    return Response.json({ proposals });
  } catch (err: any) {
    console.error("Add-slide generation error:", err);
    return Response.json(
      { error: err.message || "Failed to generate slide proposals" },
      { status: 500 }
    );
  }
}
