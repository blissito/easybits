import type { Route } from "./+types/pool.$poolId.group";
import { db } from "~/.server/db";
import { createPoolGroup } from "~/.server/integrations/whatsapp/baileys.server";

// POST /api/v2/pool/:poolId/group
//
// Crea un grupo de WhatsApp NUEVO desde el número del pool y devuelve su invite
// link. Lo consume denik (createEasybitsWhatsAppGroup) para el feature "abre el
// grupo para hablar con el agente". Auth = el bearer token del pool (igual que
// /pool/:poolId/message). Síncrono: el invite link llega en la respuesta.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS });
}

export async function action({ request, params }: Route.ActionArgs) {
  const poolId = params.poolId!;
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const pool = await db.pool.findUnique({ where: { id: poolId } });
  if (!pool || !bearer || pool.token !== bearer) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  // dnk_pub_ de la org → se guarda por grupo y scopea el MCP per-mensaje.
  const denikApiKey = typeof body?.denikApiKey === "string" ? body.denikApiKey : undefined;
  if (!name) {
    return Response.json({ error: "name required" }, { status: 400, headers: CORS });
  }

  try {
    const { groupJid, inviteUrl } = await createPoolGroup(poolId, name, denikApiKey);
    return Response.json({ groupJid, inviteUrl }, { headers: CORS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "group create failed";
    // socket no conectado → 409 (el dueño aún no pareó el número).
    const status = /not connected/i.test(msg) ? 409 : 502;
    return Response.json({ error: msg }, { status, headers: CORS });
  }
}
