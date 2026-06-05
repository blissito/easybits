import type { Route } from "./+types/sandboxes-collection";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import {
  createSandbox,
  listSandboxes,
  type SandboxTemplate,
} from "~/.server/core/sandboxOperations";

// GET /api/v2/sandboxes — list sandboxes owned by the caller
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const sandboxes = await listSandboxes(ctx);
  return Response.json({ sandboxes });
}

// POST /api/v2/sandboxes — spawn a microVM
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const body = await request.json().catch(() => ({}));
  if (!body?.template) {
    return Response.json({ error: "template required" }, { status: 400 });
  }
  const result = await createSandbox(ctx, {
    template: body.template as SandboxTemplate,
    timeoutSeconds:
      typeof body.timeoutSeconds === "number" ? body.timeoutSeconds : undefined,
    name: typeof body.name === "string" ? body.name : undefined,
    metadata:
      body.metadata && typeof body.metadata === "object"
        ? body.metadata
        : undefined,
  });
  return Response.json(result);
}
