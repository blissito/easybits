import type { Route } from "./+types/fleet-agents.$fleetAgentId.groups";
import { authenticateRequest, requireAuth } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { listFleetAgentGroups } from "~/.server/integrations/whatsapp/baileys.server";

// GET  /api/v2/fleet-agents/:fleetAgentId/groups
//   → { groups: [{ groupId, subject, enabled, isMain }] }  — grupos de WhatsApp que
//     el número descubrió (participa o vio actividad), con su estado.
// POST /api/v2/fleet-agents/:fleetAgentId/groups
//   { groupId, on }        → prende/apaga si el agente responde en ese grupo
//   { groupId, main: true } → designa (o desmarca) el grupo MAIN (canal admin)
//
// Auth = dueño (JWT/API key de la cuenta), igual que /connect y create/list/delete.
// Espeja la lógica de los intents `toggle-group` / `set-main` del dashboard para que
// una app externa (Formmy) maneje el flujo Baileys completo por SDK.
async function ownAgent(request: Request, fleetAgentId: string) {
  const ctx = requireAuth(await authenticateRequest(request));
  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: fleetAgentId } });
  if (!fleetAgent || fleetAgent.ownerId !== ctx.user.id) {
    throw new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }
  return fleetAgent;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const fleetAgent = await ownAgent(request, params.fleetAgentId!);
  const groups = await listFleetAgentGroups(fleetAgent.id, { live: true });
  return Response.json({
    groups: groups.map((g) => ({
      groupId: g.id,
      subject: g.subject,
      enabled: g.enabled,
      isMain: fleetAgent.mainGroupJid === g.id,
    })),
  });
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const fleetAgent = await ownAgent(request, params.fleetAgentId!);
  const body = await request.json().catch(() => ({}));
  const groupId = typeof body?.groupId === "string" ? body.groupId : "";
  if (!groupId) return Response.json({ error: "groupId required" }, { status: 400 });

  // set-main (espeja el intent set-main del dash): solo un grupo ACTIVO puede ser main;
  // re-mandarlo lo desmarca.
  if (body?.main) {
    const mainNext = fleetAgent.mainGroupJid === groupId ? null : groupId;
    if (mainNext && !fleetAgent.enabledGroups.includes(mainNext)) {
      return Response.json({ error: "el grupo main debe estar activo" }, { status: 400 });
    }
    await db.fleetAgent.update({ where: { id: fleetAgent.id }, data: { mainGroupJid: mainNext } });
    return Response.json({ ok: true, mainGroupJid: mainNext });
  }

  // toggle-group (espeja el intent toggle-group del dash): un grupo apagado no puede
  // seguir siendo main → se limpia.
  const on = body?.on === true || body?.on === "1";
  const set = new Set(fleetAgent.enabledGroups);
  if (on) set.add(groupId);
  else set.delete(groupId);
  const data: { enabledGroups: string[]; mainGroupJid?: null } = { enabledGroups: [...set] };
  if (!on && fleetAgent.mainGroupJid === groupId) data.mainGroupJid = null;
  await db.fleetAgent.update({ where: { id: fleetAgent.id }, data });
  return Response.json({ ok: true, enabled: on, enabledGroups: data.enabledGroups });
}
