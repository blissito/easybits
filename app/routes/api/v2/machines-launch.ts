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
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json(await launchApp(ctx, body));
  } catch (e: any) {
    // Errors thrown as a Response (billing/plan gates) already carry their own
    // status and body — pass them through untouched.
    if (e instanceof Response) return e;
    // Everything else used to surface as a bare 500 "Unexpected Server Error",
    // which tells the caller nothing about a bad payload or an ephemeral box.
    const status = e?.status ?? (e?.code ? 400 : 500);
    return Response.json(
      { error: e?.code ?? "LaunchFailed", message: String(e?.message ?? e) },
      { status }
    );
  }
}
