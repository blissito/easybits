import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { docEvents } from "~/.server/core/docEvents";
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

      // Heartbeat
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { clearInterval(heartbeat); }
      }, 15_000);

      // Listen for doc changes
      const onChanged = (payload: { id: string; sections?: unknown; updatedAt?: unknown }) => {
        if (payload.id === id) {
          send("doc-update", { sections: payload.sections, updatedAt: payload.updatedAt });
        }
      };
      docEvents.on("doc:changed", onChanged);

      // Cleanup on disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        docEvents.off("doc:changed", onChanged);
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
