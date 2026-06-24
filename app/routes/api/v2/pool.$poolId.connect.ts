import type { Route } from "./+types/pool.$poolId.connect";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { connectPool, disconnectPool } from "~/.server/integrations/whatsapp/baileys.server";

// GET  /api/v2/pool/:poolId/connect → current Baileys state (poll for QR/status)
// POST /api/v2/pool/:poolId/connect → start the socket (lazy init); ?disconnect=1 to stop
async function ownPool(request: Request, poolId: string) {
  const ctx = requireAuth(await authenticateRequest(request));
  const pool = await db.pool.findUnique({ where: { id: poolId } });
  if (!pool || pool.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }
  return pool;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const pool = await ownPool(request, params.poolId!);
  return Response.json({ baileys: pool.baileys ?? { status: "disconnected" } });
}

export async function action({ request, params }: Route.ActionArgs) {
  const pool = await ownPool(request, params.poolId!);
  const url = new URL(request.url);
  if (url.searchParams.get("disconnect")) {
    await disconnectPool(pool.id);
    return Response.json({ ok: true, status: "disconnected" });
  }
  await connectPool(pool.id);
  const fresh = await db.pool.findUnique({ where: { id: pool.id } });
  return Response.json({ ok: true, baileys: fresh?.baileys ?? { status: "connecting" } });
}
