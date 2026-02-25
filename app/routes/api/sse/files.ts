import type { Route } from "./+types/files";
import { getUserOrRedirect } from "~/.server/getters";
import { fileEvents } from "~/.server/core/fileEvents";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  const userId = user.id;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // stream closed
        }
      };

      const onChange = (changedUserId: string) => {
        if (changedUserId === userId) {
          send("changed");
        }
      };

      fileEvents.on("file:changed", onChange);

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        send("heartbeat");
      }, 30_000);

      // Cleanup on abort
      request.signal.addEventListener("abort", () => {
        fileEvents.off("file:changed", onChange);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
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
