import type { Route } from "./+types/fleet-agents.$fleetAgentId.tool-rules";
import type { Prisma } from "@prisma/client";
import { db } from "~/.server/db";
import { authFleetAgent } from "~/.server/apiAuth";
import { resolveToolRules, type GroupConfig } from "~/.server/core/fleetAgentOperations";
import { cleanToolRules } from "~/lib/toolPolicy";

// GET/PUT /api/v2/fleet-agents/:fleetAgentId/tool-rules?cfgId=* — reglas por herramienta del
// agente (permitir / preguntar / negar), por canal (`cfgId`; "*" = default que heredan todos).
//   PUT { cfgId?, rules: [{ pattern: "mcp__denik__create_booking", action: "ask" }, …] }
// Scope MANAGE: el token del worker es MESSAGE y no puede quitarse sus propias reglas.
// Ruta de recurso: sin export default.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { fleetAgent } = await authFleetAgent(request, params.fleetAgentId!, "MANAGE").catch((e: { status?: number }) => {
    throw Response.json({ error: "Unauthorized" }, { status: e?.status ?? 401 });
  });
  const cfgId = new URL(request.url).searchParams.get("cfgId") ?? "*";
  const own = ((fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {})[cfgId]?.toolRules;
  return Response.json({ cfgId, rules: resolveToolRules(fleetAgent, cfgId), inherited: !own && cfgId !== "*" });
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "PUT") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const { fleetAgent } = await authFleetAgent(request, params.fleetAgentId!, "MANAGE").catch((e: { status?: number }) => {
    throw Response.json({ error: "Unauthorized" }, { status: e?.status ?? 401 });
  });
  const body = (await request.json().catch(() => ({}))) as { cfgId?: unknown; rules?: unknown };
  const cfgId = typeof body.cfgId === "string" && body.cfgId ? body.cfgId.slice(0, 200) : "*";
  if (!Array.isArray(body.rules)) return Response.json({ error: "rules (array) required" }, { status: 400 });
  const rules = cleanToolRules(body.rules);
  if (rules.length !== body.rules.length) {
    return Response.json({ error: "Cada regla es { pattern: letras, números, _ * . : -, action: allow|ask|deny }" }, { status: 400 });
  }
  const all = { ...((fleetAgent.groupConfigs as Record<string, GroupConfig> | null) ?? {}) };
  all[cfgId] = { ...(all[cfgId] ?? {}), toolRules: rules };
  await db.fleetAgent.update({ where: { id: fleetAgent.id }, data: { groupConfigs: all as unknown as Prisma.InputJsonValue } });
  return Response.json({ cfgId, rules });
}
