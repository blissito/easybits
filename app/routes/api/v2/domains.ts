import type { Route } from "./+types/domains";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import {
  addCustomDomain,
  removeCustomDomain,
  listCustomDomains,
} from "~/.server/core/customDomainOperations";
import { easybitsDnsRecords } from "~/.server/core/mailmaskOperations";

// Los registros que el dueño debe crear (TXT de verificación, comodín y, para servir un sitio
// en la raíz, A + www). Van en la respuesta para que la CLI/SDK no los tengan que adivinar.
const withDns = <T extends { domain: string; txtToken: string }>(d: T) => ({
  ...d,
  dns: easybitsDnsRecords(d.domain, d.txtToken, true),
});

export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "READ");
  const domains = await listCustomDomains(ctx.user.id);
  return Response.json({ domains: domains.map(withDns) });
}

export async function action({ request }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "POST") {
    requireScope(ctx, "WRITE");
    const body = await request.json();
    if (!body.domain) {
      return Response.json({ error: "domain required" }, { status: 400 });
    }
    try {
      const domain = await addCustomDomain(ctx.user.id, body.domain);
      return Response.json({ domain: withDns(domain) }, { status: 201 });
    } catch (e: any) {
      return Response.json({ error: e.message }, { status: 400 });
    }
  }

  if (request.method === "DELETE") {
    requireScope(ctx, "DELETE");
    const body = await request.json();
    if (!body.domainId) {
      return Response.json({ error: "domainId required" }, { status: 400 });
    }
    try {
      await removeCustomDomain(body.domainId, ctx.user.id);
      return Response.json({ ok: true });
    } catch (e: any) {
      return Response.json({ error: e.message }, { status: 400 });
    }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
