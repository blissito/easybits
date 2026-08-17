import type { Route } from "./+types/screenshots";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { consumeService } from "~/.server/services/consume";
import type { ScreenshotOutput } from "~/.server/services/providers/render";

/**
 * POST /api/v2/screenshots — captura cómo se ve una página.
 *
 * POST y no GET a propósito: el `html` de una landing pesa cientos de KB y no cabe
 * en un query string. Escribe un File público, así que exige scope WRITE.
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

  const result = await consumeService<ScreenshotOutput>("render.screenshot", body, {
    userId: ctx.user.id,
  });
  return Response.json(result.data);
}
