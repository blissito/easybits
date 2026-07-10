import type { Route } from "./+types/calls.transcript";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getCallTranscript } from "~/.server/core/studioOperations";

// GET /api/v2/calls/transcript
// Transcript más reciente de tus Files (registro durable, sobrevive al destroy
// de la VM). Para el estado en vivo de una llamada específica usa
// /api/v2/calls/:id/transcript.
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await getCallTranscript(ctx, {});
  return Response.json(result);
}
