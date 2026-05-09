import type { Route } from "./+types/agent-extend";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { extendAgent } from "~/.server/core/sandboxOperations";

// POST /api/v2/agents/:id/extend
//
// Owner-only. Empuja expiresAt del Agent (y del sandbox subyacente) hacia
// adelante. Body opcional: { extendSeconds }. Default 300, clamp [30, 3600]
// vía sandbox-host. La vida total restante también se cap a 3600s desde
// ahora — para extender más, llamar repetidamente.
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  let extendSeconds: number | undefined;
  if (request.headers.get("content-length") !== "0") {
    try {
      const body = (await request.json()) as { extendSeconds?: number };
      extendSeconds = body.extendSeconds;
    } catch {
      // empty / non-JSON body → use default
    }
  }
  const result = await extendAgent(ctx, params.id!, extendSeconds);
  return Response.json(result);
}
