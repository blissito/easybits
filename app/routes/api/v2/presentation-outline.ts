import type { Route } from "./+types/presentation-outline";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { streamObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { OUTLINE_SYSTEM_PROMPT } from "~/lib/presentationPrompts";
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

  const userKey = await resolveAiKey(ctx.user.id, "ANTHROPIC");
  const anthropic = userKey
    ? createAnthropic({ apiKey: userKey })
    : createAnthropic();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: any) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        const result = streamObject({
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

        let lastSentCount = 0;

        for await (const partial of result.partialObjectStream) {
          const items = partial.outline;
          if (!items || items.length === 0) continue;

          // Send newly completed slides (have all required fields)
          for (let i = lastSentCount; i < items.length; i++) {
            const item = items[i];
            if (item && item.title && item.bullets && item.bullets.length > 0 && item.type) {
              send("slide", { index: i, item, total: slideCount });
              lastSentCount = i + 1;
            }
          }
        }

        const final = await result.object;
        send("done", { outline: final.outline });
        controller.close();
      } catch (err: any) {
        console.error("Outline stream error:", err);
        send("error", { error: err.message || "Failed to generate outline" });
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
