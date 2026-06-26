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

type WabaOrg = {
  phoneNumberId?: string;
  phoneNumber?: string;
  name?: string;
  systemPrompt?: string;
  denikApiKey?: string;
};
type WabaConfig = {
  formmySecret?: string;
  orgs?: Record<string, WabaOrg>;
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
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  const formmySecret = str(body?.formmySecret);
  const integrationId = str(body?.integrationId);
  const phoneNumberId = str(body?.phoneNumberId);
  // denikApiKey is OPTIONAL (reseller path); native pools scope via Capacidades.
  const denikApiKey = str(body?.denikApiKey);
  const phoneNumber = str(body?.phoneNumber);
  const name = str(body?.name);
  const systemPrompt = str(body?.systemPrompt);
  if (!formmySecret || !integrationId || !phoneNumberId) {
    return Response.json(
      { error: "formmySecret, integrationId and phoneNumberId required" },
      { status: 400, headers: CORS }
    );
  }

  const current = (pool.wabaConfig as WabaConfig | null) ?? {};
  // Merge over any existing entry for this integration so a re-register that omits
  // optional fields (identity, denik key) doesn't wipe previously-set values.
  const prevOrg = current.orgs?.[integrationId] ?? {};
  const next: WabaConfig = {
    ...current,
    formmySecret,
    orgs: {
      ...(current.orgs ?? {}),
      [integrationId]: {
        ...prevOrg,
        phoneNumberId,
        ...(phoneNumber ? { phoneNumber } : {}),
        ...(name ? { name } : {}),
        ...(systemPrompt ? { systemPrompt } : {}),
        ...(denikApiKey ? { denikApiKey } : {}),
      },
    },
  };
  await db.pool.update({ where: { id: poolId }, data: { wabaConfig: next } });

  return Response.json({ ok: true }, { headers: CORS });
}
