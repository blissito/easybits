import type { Route } from "./+types/pool.$poolId.waba.config";
import { db } from "~/.server/db";

// POST /api/v2/pool/:poolId/waba/config
//
// Denik writes the pool's WABA config here so the inbound forward (/waba/message)
// can authenticate Formmy and scope each org's worker. Auth = pool.token (the
// owner-trusted bearer, same as the pool message route) — NOT formmySecret, which
// is the value this very call sets.
//
// Merge semantics: overwrite formmySecret (one per pool) and set/replace the one
// org keyed by integrationId; preserve all other orgs already configured.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

type WabaConfig = {
  formmySecret?: string;
  orgs?: Record<string, { denikApiKey?: string; phoneNumberId?: string }>;
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
  const formmySecret = typeof body?.formmySecret === "string" ? body.formmySecret : "";
  const integrationId = typeof body?.integrationId === "string" ? body.integrationId : "";
  const denikApiKey = typeof body?.denikApiKey === "string" ? body.denikApiKey : "";
  const phoneNumberId = typeof body?.phoneNumberId === "string" ? body.phoneNumberId : "";
  if (!formmySecret || !integrationId || !denikApiKey || !phoneNumberId) {
    return Response.json(
      { error: "formmySecret, integrationId, denikApiKey and phoneNumberId required" },
      { status: 400, headers: CORS }
    );
  }

  const current = (pool.wabaConfig as WabaConfig | null) ?? {};
  const next: WabaConfig = {
    ...current,
    formmySecret,
    orgs: {
      ...(current.orgs ?? {}),
      [integrationId]: { denikApiKey, phoneNumberId },
    },
  };
  await db.pool.update({ where: { id: poolId }, data: { wabaConfig: next } });

  return Response.json({ ok: true }, { headers: CORS });
}
