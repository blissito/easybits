import type { Route } from "./+types/pool.$poolId.message";
import { db } from "~/.server/db";
import { routeMessage, PoolAtCapacity, PoolRateLimited } from "~/.server/core/poolOperations";

// POST /api/v2/pool/:poolId/message
//
// The always-on Baileys SURFACE (nano) calls this per inbound WhatsApp group
// message. Auth = the pool's bearer token. WhatsApp is non-streaming, so we
// collect the worker's reply server-side and return it as JSON for the surface
// to send back to the group.
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
  const groupId = typeof body?.groupId === "string" ? body.groupId : "";
  const text = typeof body?.text === "string" ? body.text : "";
  if (!groupId || !text.trim()) {
    return Response.json({ error: "groupId and text required" }, { status: 400, headers: CORS });
  }

  // Rate-limit lives in routeMessage now (per (pool, group)) so it covers both
  // this HTTP surface and the in-process Baileys path. PoolRateLimited → 429.
  try {
    const reply = await routeMessage(poolId, {
      groupId,
      sender: typeof body?.sender === "string" ? body.sender : undefined,
      text,
      mediaUrl: typeof body?.mediaUrl === "string" ? body.mediaUrl : undefined,
    });
    return Response.json({ reply }, { headers: CORS });
  } catch (e) {
    if (e instanceof PoolRateLimited) {
      return Response.json(
        { error: "rate_limited", message: e.message },
        { status: 429, headers: { ...CORS, "Retry-After": "10" } }
      );
    }
    if (e instanceof PoolAtCapacity) {
      // Surface should queue/retry — no worker available right now.
      return Response.json(
        { error: "pool_at_capacity", message: e.message },
        { status: 503, headers: { ...CORS, "Retry-After": "10" } }
      );
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "pool error" },
      { status: 502, headers: CORS }
    );
  }
}
