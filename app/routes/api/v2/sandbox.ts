import type { Route } from "./+types/sandbox";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import {
  getSandbox,
  destroySandbox,
  hostErrorResponse,
} from "~/.server/core/sandboxOperations";

// GET /api/v2/sandboxes/:id — status
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  try {
    return Response.json(await getSandbox(ctx, params.id));
  } catch (e) {
    // Un 404 del host ("sandbox not found") llega como 404, no como 500.
    return hostErrorResponse(e) ?? Promise.reject(e);
  }
}

// DELETE /api/v2/sandboxes/:id — destroy
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(
    ctx.apiKey?.id ?? ctx.user.id,
    "op"
  );
  if (limited) return limited;
  try {
    return Response.json(await destroySandbox(ctx, params.id));
  } catch (e) {
    return hostErrorResponse(e) ?? Promise.reject(e);
  }
}
