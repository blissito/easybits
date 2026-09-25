import type { Route } from "./+types/render-compare";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { consumeService } from "~/.server/services/consume";
import { QuotaExceededError, ServiceProviderError } from "~/.server/services/errors";
import type { CompareOutput } from "~/.server/services/providers/render";

/**
 * POST /api/v2/render/compare — compara un clon HTML contra su PDF original.
 *
 * Body: { fileId | pdfUrl, pages: [{ page, html }], waitMs? }. Los umbrales son
 * fijos: quien llama suele ser el agente al que se califica.
 * Corre en la caja de render del owner, guarda las imágenes de diff en Files y
 * cobra por página → exige scope WRITE.
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
  if (!body.fileId && !body.pdfUrl) {
    return Response.json({ error: "Either 'fileId' or 'pdfUrl' is required" }, { status: 400 });
  }
  if (!Array.isArray(body.pages) || body.pages.length === 0) {
    return Response.json({ error: "'pages' must be a non-empty array of { page, html }" }, { status: 400 });
  }

  try {
    const result = await consumeService<CompareOutput>("render.compare", body, {
      userId: ctx.user.id,
    });
    return Response.json(result.data);
  } catch (e) {
    // Entrada inválida (PDF ajeno, URL privada, >20 páginas): el motivo le sirve
    // al agente para corregir; un 500 genérico sólo lo haría reintentar.
    if (e instanceof ServiceProviderError) {
      return Response.json({ error: e.providerMessage, code: e.code }, { status: e.providerStatus ?? 400 });
    }
    if (e instanceof QuotaExceededError) {
      return Response.json(
        { error: "Sin créditos", code: e.code, requiredCost: e.requiredCost, available: e.available },
        { status: 402 },
      );
    }
    throw e;
  }
}
