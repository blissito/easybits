import type { Route } from "./+types/videos-render";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { renderViaHyperframesBox } from "~/.server/core/fleetVideo";

// POST /api/v2/videos/render
// Renders a self-contained HyperFrames composition (HTML + GSAP timeline) to MP4
// via the owner's on-demand hyperframes-svc box, stores it in the owner's Files,
// and returns { file: { fileId, url, contentType, size, renderMs } }.
//
// Synchronous: a short clip renders in tens of seconds. If renders grow long,
// upgrade to a job+poll surface (see services/captions) — the box hard-caps at
// 240s internally so this action can't hang indefinitely.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE"); // creating a File

  const body = (await request.json().catch(() => ({}))) as {
    html?: string;
    fps?: number;
    quality?: "draft" | "standard" | "high";
    resolution?: string;
    format?: "mp4" | "webm";
    fileName?: string;
  };

  if (!body.html || !body.html.trim()) {
    return Response.json({ error: "html is required" }, { status: 400 });
  }

  try {
    const file = await renderViaHyperframesBox(ctx, {
      html: body.html,
      fps: body.fps,
      quality: body.quality,
      resolution: body.resolution,
      format: body.format,
      fileName: body.fileName,
    });
    return Response.json({ file });
  } catch (err: any) {
    return Response.json(
      { error: err?.message || "Video render failed" },
      { status: 502 },
    );
  }
}
