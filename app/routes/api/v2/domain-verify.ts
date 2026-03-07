import type { Route } from "./+types/domain-verify";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { verifyCustomDomain } from "~/.server/core/customDomainOperations";

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

  try {
    const domain = await verifyCustomDomain(domainId, ctx.user.id);
    return Response.json({ domain });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
