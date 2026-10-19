import type { Route } from "./+types/copilot.crons.chat";
import { handleCopilotChat, MY_CRONS_SURFACE } from "~/.server/core/copilotChat.server";

// Bittor de «Mis crons» (cualquier cuenta, con tope diario). El flujo vive en copilotChat.server.ts.
export async function action({ request }: Route.ActionArgs) {
  return handleCopilotChat(request, MY_CRONS_SURFACE);
}
