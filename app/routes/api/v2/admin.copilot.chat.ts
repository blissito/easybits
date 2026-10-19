import type { Route } from "./+types/admin.copilot.chat";
import { ADMIN_CRONS_SURFACE, handleCopilotChat } from "~/.server/core/copilotChat.server";

// Piloto del panel de crons de la plataforma (sólo superusuarios). El flujo vive en copilotChat.server.ts.
export async function action({ request }: Route.ActionArgs) {
  return handleCopilotChat(request, ADMIN_CRONS_SURFACE);
}
