import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import type { Route } from "./+types/document-watch";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
    return new Response("Missing or invalid id", { status: 400 });
  }

  // Verify ownership
  const doc = await db.landing.findUnique({ where: { id }, select: { ownerId: true, version: true } });
  if (!doc || doc.ownerId !== user.id || doc.version !== 4) {
    return new Response("Not found", { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let lastUpdatedAt: string | null = null;

      // Poll DB for changes every 3 seconds
      const poll = setInterval(async () => {
        try {
          const current = await db.landing.findUnique({
            where: { id },
            select: { updatedAt: true, sections: true },
          });
          if (!current) return;

          const ts = current.updatedAt.toISOString();
          if (lastUpdatedAt !== null && ts !== lastUpdatedAt) {
            send("doc-update", { sections: current.sections, updatedAt: ts });
          }
          lastUpdatedAt = ts;
        } catch {
          // DB error — skip this tick
        }
      }, 3_000);

      // Heartbeat every 15s
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { /* noop */ }
      }, 15_000);

      // Cleanup on disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(poll);
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
