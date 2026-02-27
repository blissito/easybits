import type { Route } from "./+types/presentation";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import {
  getPresentation,
  updatePresentation,
  deletePresentation,
} from "~/.server/core/presentationOperations";

// GET /api/v2/presentations/:id
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const presentation = await getPresentation(ctx, params.id!);
  return Response.json(presentation);
}

// PATCH or DELETE /api/v2/presentations/:id
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "DELETE") {
    requireScope(ctx, "DELETE");
    const result = await deletePresentation(ctx, params.id!);
    return Response.json(result);
  }

  if (request.method === "PATCH") {
    requireScope(ctx, "WRITE");
    const body = await request.json();
    const updated = await updatePresentation(ctx, params.id!, {
      name: body.name,
      slides: body.slides,
      theme: body.theme,
      prompt: body.prompt,
    });
    return Response.json({ presentation: updated });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
