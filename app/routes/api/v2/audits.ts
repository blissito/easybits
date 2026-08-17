import type { Route } from "./+types/audits";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { consumeService } from "~/.server/services/consume";
import type { AuditOutput } from "~/.server/services/providers/render";

/**
 * POST /api/v2/audits — mide accesibilidad y layout de una página.
 *
 * POST y no GET por lo mismo que /screenshots: el `html` de una landing no cabe
 * en un query string. No escribe ningún File (el valor es el JSON), pero corre en
 * la caja del owner y se cobra por viewport, así que exige scope WRITE.
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE");

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.html && !body.url) {
    return Response.json({ error: "Either 'html' or 'url' is required" }, { status: 400 });
  }

  const result = await consumeService<AuditOutput>("render.audit", body, {
    userId: ctx.user.id,
  });
  return Response.json(result.data);
}
