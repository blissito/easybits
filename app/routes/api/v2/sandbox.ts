import type { Route } from "./+types/sandbox";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { getSandbox, destroySandbox } from "~/.server/core/sandboxOperations";

// GET /api/v2/sandboxes/:id — status
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const sandbox = await getSandbox(ctx, params.id);
  return Response.json(sandbox);
}

// DELETE /api/v2/sandboxes/:id — destroy
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await destroySandbox(ctx, params.id);
  return Response.json(result);
}
