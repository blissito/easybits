import type { Route } from "./+types/video-generate";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { createVideo, type VideoEvent } from "~/.server/core/videoOperations";
import type { VideoAspectRatio, VideoModel } from "~/.server/runway";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json().catch(() => ({})) as {
    prompt?: string;
    character?: string;
    referenceImageUrl?: string;
    ratio?: VideoAspectRatio;
    duration?: number;
    model?: VideoModel;
    seed?: number;
  };

  if (!body.prompt || !body.prompt.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: VideoEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`),
          );
        } catch {
          // Controller may already be closed — ignore.
        }
      };

      try {
        await createVideo(
          ctx,
          {
            prompt: body.prompt!,
            character: body.character,
            referenceImageUrl: body.referenceImageUrl,
            ratio: body.ratio,
            duration: body.duration,
            model: body.model,
            seed: body.seed,
          },
          send,
        );
      } catch (err: any) {
        send({ type: "error", message: err?.message || "Video generation failed" });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
