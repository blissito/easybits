import type { Route } from "./+types/agent-whatsapp-link";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import {
  linkWhatsapp,
  type WhatsappLinkBody,
} from "~/.server/core/whatsappOperations";

// POST /api/v2/agents/:id/whatsapp/link
//
// Owner-only. Body JSON: { method: "qr" | "pairing", phoneNumber? }
// - method=qr → upstream devuelve { status:"qr_pending", qr, expiresAt }
// - method=pairing → upstream devuelve { status:"pairing", code }
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const ctx = requireAuth(await authenticateRequest(request));
  let body: WhatsappLinkBody;
  try {
    body = (await request.json()) as WhatsappLinkBody;
  } catch {
    return Response.json({ error: "JSON body required" }, { status: 400 });
  }
  try {
    const result = await linkWhatsapp(ctx, params.id!, body);
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal error";
    const status = msg.includes("not found")
      ? 404
      : msg.includes("unavailable") || msg.includes("cannot reach") || msg.includes("must be") || msg.includes("required")
        ? 400
        : 502;
    return Response.json({ error: msg }, { status });
  }
}
