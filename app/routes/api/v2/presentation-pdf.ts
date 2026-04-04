import type { Route } from "./+types/presentation-pdf";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { takePresentationPdf } from "~/.server/core/presentationScreenshot";
import { db } from "~/.server/db";

// GET /api/v2/presentations/:id/pdf
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const pdf = await takePresentationPdf(ctx.user.id, params.id!);
  if (!pdf) {
    return Response.json({ error: "Presentation not found or has no slides" }, { status: 404 });
  }

  const pres = await db.presentation.findUnique({ where: { id: params.id! }, select: { name: true } });
  const filename = (pres?.name || "presentation").replace(/[^a-zA-Z0-9_\-. ]/g, "_") + ".pdf";

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
