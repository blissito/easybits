import type { Route } from "./+types/webhooks";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { listWebhooks, createWebhook } from "~/.server/core/webhookOperations";

// GET /api/v2/webhooks
export async function loader({ request }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await listWebhooks(ctx);
  return Response.json(result);
}

// POST /api/v2/webhooks
export async function action({ request }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "POST") {
    const body = await request.json();
    const result = await createWebhook(ctx, {
      url: body.url,
      events: body.events,
    });
    return Response.json(result, { status: 201 });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
