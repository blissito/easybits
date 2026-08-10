import type { Route } from "./+types/machines-launch";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { applySandboxRateLimit } from "~/.server/rateLimiter";
import { launchApp } from "~/.server/core/releaseOperations";

// POST /api/v2/machines/launch — an app in production in one call: machine +
// code + build + public HTTPS URL + recovery release + optional domain.
// Source is exactly one of repo | archiveUrl | sandboxId.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  const limited = await applySandboxRateLimit(ctx.apiKey?.id ?? ctx.user.id, "create");
  if (limited) return limited;
  const body = await request.json();
  return Response.json(await launchApp(ctx, body));
}
