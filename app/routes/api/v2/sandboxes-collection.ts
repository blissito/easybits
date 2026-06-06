import type { Route } from "./+types/sandboxes-collection";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { SandboxCreateBody } from "~/.server/sandbox/schemas";
import {
  createSandbox,
  listSandboxes,
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
  const limited = await applySandboxRateLimit(
    ctx.apiKey?.id ?? ctx.user.id,
    "create"
  );
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const parsed = SandboxCreateBody.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const result = await createSandbox(ctx, parsed.data);
  return Response.json(result);
}
