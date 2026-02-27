import type { Route } from "./+types/presentation-generate";
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
import { searchImage } from "~/.server/images/pexels";
import { SCENE_EFFECT_IDS } from "~/lib/buildRevealHtml";

interface OutlineItem {
  title: string;
  bullets: string[];
  imageQuery?: string;
  type?: "2d" | "3d";
}

const sceneEffectSchema = z.object({
  effect: z.enum(SCENE_EFFECT_IDS as unknown as [string, ...string[]]),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  speed: z.number().optional(),
  density: z.number().optional(),
  backgroundColor: z.string().optional(),
});

// POST /api/v2/presentations/:id/generate
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
  const outline = body.outline as OutlineItem[];

  if (!Array.isArray(outline) || outline.length === 0) {
    return Response.json({ error: "Outline required" }, { status: 400 });
  }

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const anthropic = userKey
    ? createAnthropic({ apiKey: userKey })
    : createAnthropic();

  // Split by type
  const items2D: { item: OutlineItem; originalIdx: number }[] = [];
  const items3D: { item: OutlineItem; originalIdx: number }[] = [];

  outline.forEach((item, i) => {
    if (item.type === "3d") {
      items3D.push({ item, originalIdx: i });
    } else {
      items2D.push({ item, originalIdx: i });
    }
  });

  try {
    // Run 2D and 3D generation in parallel
    const [slides2D, slides3D] = await Promise.all([
      generate2DSlides(items2D, anthropic),
      generate3DSlides(items3D, anthropic),
    ]);

    // Merge back in original order
    const slides = outline.map((item, i) => {
      if (item.type === "3d") {
        const match = slides3D.find((s) => s.originalIdx === i);
        return {
          id: nanoid(8),
          order: i,
          type: "3d" as const,
          sceneEffect: match?.sceneEffect,
          title: match?.title || item.title,
          subtitle: match?.subtitle,
          backgroundColor: match?.sceneEffect?.backgroundColor,
        };
      } else {
        const match = slides2D.find((s) => s.originalIdx === i);
        return {
          id: nanoid(8),
          order: i,
          type: "2d" as const,
          html: match?.html || "",
        };
      }
    });

    await db.presentation.update({
      where: { id: params.id },
      data: { slides: slides as any },
    });

    return Response.json({ slides });
  } catch (err: any) {
    console.error("Slide generation error:", err);
    return Response.json(
      { error: err.message || "Failed to generate slides" },
      { status: 500 }
    );
  }
}

async function generate2DSlides(
  items: { item: OutlineItem; originalIdx: number }[],
  anthropic: ReturnType<typeof createAnthropic>
) {
  if (items.length === 0) return [];

  // Fetch images in parallel
  const imageResults = await Promise.all(
    items.map((e) =>
      e.item.imageQuery
        ? searchImage(e.item.imageQuery)
        : Promise.resolve(null)
    )
  );

  const outlineText = items
    .map((e, i) => {
      let text = `Slide ${i + 1}: ${e.item.title}\n${e.item.bullets.map((b) => `  - ${b}`).join("\n")}`;
      const img = imageResults[i];
      if (img)
        text += `\n  Image URL: ${img.url} (alt: ${img.alt}, credit: ${img.photographer})`;
      return text;
    })
    .join("\n\n");

  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: z.object({
      slides: z
        .array(z.string())
        .describe("Array of HTML strings, one per slide"),
    }),
    system: SLIDES_SYSTEM_PROMPT,
    prompt: `Generate reveal.js HTML slides for this outline:\n\n${outlineText}`,
  });

  return object.slides.slice(0, items.length).map((html, i) => ({
    html,
    originalIdx: items[i].originalIdx,
  }));
}

async function generate3DSlides(
  items: { item: OutlineItem; originalIdx: number }[],
  anthropic: ReturnType<typeof createAnthropic>
) {
  if (items.length === 0) return [];

  // Generate each 3D slide independently
  const results = await Promise.all(
    items.map(async (entry) => {
      const { object } = await generateObject({
        model: anthropic("claude-haiku-4-5-20251001"),
        schema: z.object({
          sceneEffect: sceneEffectSchema,
          title: z.string().optional(),
          subtitle: z.string().optional(),
        }),
        system: SCENE_SYSTEM_PROMPT,
        prompt: `Create a 3D scene for a presentation slide about: "${entry.item.title}"\nContext: ${entry.item.bullets.join(", ")}`,
      });

      return {
        originalIdx: entry.originalIdx,
        sceneEffect: object.sceneEffect,
        title: object.title,
        subtitle: object.subtitle,
      };
    })
  );

  return results;
}
