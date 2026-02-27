import type { Route } from "./+types/presentations";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import {
  listPresentations,
  createPresentation,
} from "~/.server/core/presentationOperations";

// GET /api/v2/presentations
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await listPresentations(ctx);
  return Response.json(result);
}

// POST /api/v2/presentations
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const ctx = requireAuth(await authenticateRequest(request));
  requireScope(ctx, "WRITE");

  const body = await request.json();
  const presentation = await createPresentation(ctx, {
    name: String(body.name || ""),
    prompt: String(body.prompt || ""),
    slides: body.slides,
    theme: body.theme,
  });
  return Response.json({ presentation });
}
