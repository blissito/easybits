import type { Route } from "./+types/domain-apex";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { setDomainApex } from "~/.server/core/customDomainOperations";

/**
 * POST /api/v2/domains/:domainId/apex  { websiteId: string | null }
 * Asigna el sitio servido en el dominio raíz (y www). null lo quita.
 */
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE");

  const domainId = params.domainId;
  if (!domainId) {
    return Response.json({ error: "domainId required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { websiteId?: string | null };
  const websiteId = typeof body.websiteId === "string" && body.websiteId ? body.websiteId : null;

  try {
    const domain = await setDomainApex(domainId, ctx.user.id, websiteId);
    return Response.json({ domain });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
