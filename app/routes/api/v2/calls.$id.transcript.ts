import type { Route } from "./+types/calls.$id.transcript";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getCallTranscript } from "~/.server/core/studioOperations";

// GET /api/v2/calls/:id/transcript
// Estado EN VIVO del transcript de la llamada (el box es la fuente de verdad
// mientras la VM vive): transcribing | ready | failed | unknown. Devuelve el
// texto inline cuando ready. Cae al .txt de Files si la VM ya se destruyó.
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await getCallTranscript(ctx, { sandboxId: params.id });
  return Response.json(result);
}
