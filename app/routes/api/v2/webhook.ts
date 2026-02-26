import type { Route } from "./+types/webhook";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import {
  getWebhook,
  updateWebhookConfig,
  deleteWebhookById,
} from "~/.server/core/webhookOperations";

// GET /api/v2/webhooks/:webhookId
export async function loader({ request, params }: Route.LoaderArgs) {
  const ctx = requireAuth(await authenticateRequest(request));
  const result = await getWebhook(ctx, params.webhookId!);
  return Response.json(result);
}

// PATCH/DELETE /api/v2/webhooks/:webhookId
export async function action({ request, params }: Route.ActionArgs) {
  const ctx = requireAuth(await authenticateRequest(request));

  if (request.method === "PATCH") {
    const body = await request.json();
    const result = await updateWebhookConfig(ctx, params.webhookId!, {
      url: body.url,
      events: body.events,
      status: body.status,
    });
    return Response.json(result);
  }

  if (request.method === "DELETE") {
    const result = await deleteWebhookById(ctx, params.webhookId!);
    return Response.json(result);
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
