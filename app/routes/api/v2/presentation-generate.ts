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

const SINGLE_SLIDE_SYSTEM_PROMPT = SLIDES_SYSTEM_PROMPT.replace(
  "Output ONLY a valid JSON array of HTML strings, no markdown fences",
  "Output ONLY a single HTML string (the inner HTML of one <section>), no markdown fences"
).replace(
  'slides: z\n        .array(z.string())',
  'html: z.string()'
);

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

  const encoder = new TextEncoder();
  const allSlides: any[] = new Array(outline.length).fill(null);

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: any) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        // Fetch all images in parallel upfront
        const imageResults = await Promise.all(
          outline.map((item) =>
            item.imageQuery && item.type !== "3d"
              ? searchImage(item.imageQuery)
              : Promise.resolve(null)
          )
        );

        // Generate 3D slides in parallel (they're fast with Haiku)
        const items3D = outline
          .map((item, i) => ({ item, idx: i }))
          .filter((e) => e.item.type === "3d");

        const usedEffects: string[] = [];
        for (const entry of items3D) {
          const avoidNote =
            usedEffects.length > 0
              ? `\nALREADY USED effects (do NOT pick these): ${usedEffects.join(", ")}`
              : "";

          const { object } = await generateObject({
            model: anthropic("claude-haiku-4-5-20251001"),
            schema: z.object({
              sceneEffect: sceneEffectSchema,
              title: z.string().optional(),
              subtitle: z.string().optional(),
            }),
            system: SCENE_SYSTEM_PROMPT,
            prompt: `Create a 3D scene for a presentation slide about: "${entry.item.title}"\nContext: ${entry.item.bullets.join(", ")}${avoidNote}`,
          });

          usedEffects.push(object.sceneEffect.effect);
          const slide = {
            id: nanoid(8),
            order: entry.idx,
            type: "3d" as const,
            sceneEffect: object.sceneEffect,
            title: object.title || entry.item.title,
            subtitle: object.subtitle,
          };
          allSlides[entry.idx] = slide;
          send("slide", { index: entry.idx, slide, total: outline.length });
        }

        // Generate 2D slides one at a time
        const items2D = outline
          .map((item, i) => ({ item, idx: i }))
          .filter((e) => e.item.type !== "3d");

        for (const entry of items2D) {
          const img = imageResults[entry.idx];
          let slideText = `Slide: ${entry.item.title}\n${entry.item.bullets.map((b) => `  - ${b}`).join("\n")}`;
          if (img) {
            slideText += `\n  Image URL: ${img.url} (alt: ${img.alt}, credit: ${img.photographer})`;
          }

          const { object } = await generateObject({
            model: anthropic("claude-sonnet-4-6"),
            schema: z.object({
              html: z.string().describe("HTML string for this single slide"),
            }),
            system: SLIDES_SYSTEM_PROMPT,
            prompt: `Generate reveal.js HTML for this single slide:\n\n${slideText}`,
          });

          const slide = {
            id: nanoid(8),
            order: entry.idx,
            type: "2d" as const,
            html: object.html,
          };
          allSlides[entry.idx] = slide;
          send("slide", { index: entry.idx, slide, total: outline.length });
        }

        // Save all slides to DB
        const finalSlides = allSlides.filter(Boolean);
        await db.presentation.update({
          where: { id: params.id },
          data: { slides: finalSlides as any },
        });

        send("done", { slides: finalSlides });
        controller.close();
      } catch (err: any) {
        console.error("Slide generation error:", err);
        send("error", { error: err.message || "Failed to generate slides" });
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
