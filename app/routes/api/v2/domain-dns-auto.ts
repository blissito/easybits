import type { Route } from "./+types/domain-dns-auto";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { autoConfigureDomainDns, undoDomainDns } from "~/.server/core/customDomainOperations";
import { MailmaskNotConnected, mailmaskConnection } from "~/.server/core/mailmaskOperations";

const CONNECT_URL = `${process.env.APP_URL || "https://www.easybits.cloud"}/dash/integrations/mailmask/connect`;

// POST   /api/v2/domains/:domainId/dns-auto → escribe los registros en Mailmask y verifica.
// DELETE /api/v2/domains/:domainId/dns-auto → los deshace (restaura lo que había).
// Conectar Mailmask es un consentimiento de navegador: sin conexión se responde 409 con la liga.
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE");
  const domainId = params.domainId!;
  if (request.method !== "POST" && request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    if (request.method === "POST" && !(await mailmaskConnection(ctx.user.id)).connected) throw new MailmaskNotConnected();
    const r = request.method === "POST" ? await autoConfigureDomainDns(domainId, ctx.user.id) : await undoDomainDns(domainId, ctx.user.id);
    return Response.json(r);
  } catch (e: any) {
    if (e instanceof MailmaskNotConnected) {
      return Response.json({ error: "MailmaskNotConnected", message: e.message, connectUrl: `${CONNECT_URL}?domain=${domainId}` }, { status: 409 });
    }
    return Response.json({ error: e.message }, { status: 400 });
  }
}
