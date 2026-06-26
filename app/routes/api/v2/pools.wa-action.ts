import type { Route } from "./+types/pools.wa-action";
import { db } from "~/.server/db";
import { executeWaAction } from "~/.server/integrations/whatsapp/baileys.server";

// POST /api/v2/pools/wa-action
//
// The pool worker's in-process `wa` MCP server calls this to perform a native
// WhatsApp action (send file/poll/location/reaction, get invite link) on the
// pool's shared Baileys socket. Auth = the pool token (injected as POOL_TOKEN).
// We resolve sessionId → the conversation's group via PoolRoute, then gate
// elevated CROSS-GROUP actions to the pool's mainGroupJid (mirrors isMain).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function loader({ request }: Route.LoaderArgs) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return Response.json({ error: "Method not allowed" }, { status: 405, headers: CORS });
}

export async function action({ request }: Route.ActionArgs) {
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!bearer) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: CORS });

  const body = await request.json().catch(() => ({}));
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const actionName = typeof body?.action === "string" ? body.action : "";
  const args = (body?.args && typeof body.args === "object" ? body.args : {}) as Record<string, any>;
  if (!sessionId || !actionName) {
    return Response.json({ ok: false, error: "sessionId and action required" }, { status: 400, headers: CORS });
  }

  // Resolve the conversation: token must own the route, route gives the group.
  const route = await db.poolRoute.findFirst({
    where: { sessionUuid: sessionId, pool: { token: bearer } },
    select: {
      groupId: true,
      pool: { select: { id: true, mainGroupJid: true, enabledGroups: true, groupKeys: true, seenGroups: true } },
    },
  });
  if (!route) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: CORS });

  const sessionGroup = route.groupId;
  const poolId = route.pool.id;
  const isMain = !!route.pool.mainGroupJid && sessionGroup === route.pool.mainGroupJid;

  // Config actions (admin): administer the per-group MCP/org keys (Pool.groupKeys).
  // Only the MAIN group may list/edit other groups' keys — mirrors the cross-group
  // send gate. These are DB ops, not Baileys socket actions, so they short-circuit
  // before executeWaAction.
  if (actionName === "list_groups" || actionName === "set_group_key") {
    if (!isMain) {
      return Response.json(
        { ok: false, error: "admin de grupos: solo desde el grupo main" },
        { status: 403, headers: CORS }
      );
    }
    const keys = (route.pool.groupKeys as Record<string, string> | null) ?? {};
    const subjects = (route.pool.seenGroups as Record<string, string> | null) ?? {};
    if (actionName === "list_groups") {
      const groups = route.pool.enabledGroups.map((jid) => ({
        jid,
        subject: subjects[jid] ?? null,
        hasKey: Boolean(keys[jid]),
      }));
      return Response.json({ ok: true, result: JSON.stringify({ groups }) }, { status: 200, headers: CORS });
    }
    // set_group_key
    const jid = typeof args.jid === "string" ? args.jid : "";
    if (!jid.endsWith("@g.us")) {
      return Response.json({ ok: false, error: "jid de grupo inválido" }, { status: 400, headers: CORS });
    }
    if (!route.pool.enabledGroups.includes(jid)) {
      return Response.json({ ok: false, error: "ese grupo no está activo en el agente" }, { status: 400, headers: CORS });
    }
    const key = typeof args.key === "string" ? args.key.trim() : "";
    const nextKeys = { ...keys };
    if (key) nextKeys[jid] = key;
    else delete nextKeys[jid];
    await db.pool.update({ where: { id: poolId }, data: { groupKeys: nextKeys } });
    return Response.json(
      { ok: true, result: key ? `key asignada a ${subjects[jid] ?? jid}` : `key quitada de ${subjects[jid] ?? jid}` },
      { status: 200, headers: CORS }
    );
  }

  // Default target is the session's own group. A different target jid (cross-group
  // send) is only allowed from the MAIN group.
  let targetJid = sessionGroup;
  if (typeof args.jid === "string" && args.jid.endsWith("@g.us") && args.jid !== sessionGroup) {
    if (!isMain) {
      return Response.json(
        { ok: false, error: "cross-group send is only allowed from the main group" },
        { status: 403, headers: CORS }
      );
    }
    targetJid = args.jid;
  }

  const res = await executeWaAction(poolId, targetJid, actionName, args);
  return Response.json(res, { status: res.ok ? 200 : 400, headers: CORS });
}
