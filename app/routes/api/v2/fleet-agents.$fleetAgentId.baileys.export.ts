import type { Route } from "./+types/fleet-agents.$fleetAgentId.baileys.export";
import { authenticateRequest, requireAuth, requireScope } from "~/.server/apiAuth";
import { db } from "~/.server/db";
import { buildBaileysExport } from "~/.server/core/baileysExport";

// POST /api/v2/fleet-agents/:fleetAgentId/baileys/export
//   { dryRun: true }                  → salud de la sesión de WhatsApp personal (Baileys), sin llaves
//   { dryRun: false, confirm: "export" } → lo mismo + authCreds/authKeys, listo para gs:
//     la respuesta entra TAL CUAL a `POST gs/api/v2/agents/:id/wa/import` (más `ownNumber`)
//     porque `groups` ya es el mapa `{ "<jid>@g.us": "nombre" }` de los grupos encendidos.
//
// Sirve para migrar a Ghosty Studio sin leer Mongo a mano, y para SABER antes del corte si
// la sesión sigue viva (en tania-0 estaba muerta desde el 15-jul y nadie lo supo).
//
// Sólo el DUEÑO (ni delegados ni tokens del agente: son las llaves de una cuenta de
// WhatsApp); cualquier otro recibe 404. Sólo LEE la DB: no toca el socket, no hace logout,
// no toca cajas. Criterio de `health` en `decideHealth` (app/.server/core/baileysExport.ts).
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const ctx = requireAuth(await authenticateRequest(request));
  const body = (await request.json().catch(() => ({}))) as { dryRun?: unknown; confirm?: unknown };
  const dryRun = body?.dryRun === true;
  requireScope(ctx, dryRun ? "READ" : "WRITE");

  const fleetAgent = await db.fleetAgent.findUnique({
    where: { id: params.fleetAgentId },
    select: {
      id: true,
      ownerId: true,
      name: true,
      baileys: true,
      authCreds: true,
      authKeys: true,
      enabledGroups: true,
      mainGroupJid: true,
      seenGroups: true,
    },
  }).catch(() => null); // id que no es ObjectId → mismo 404
  if (!fleetAgent || fleetAgent.ownerId !== ctx.user.id) return json({ error: "Not found" }, 404);

  if (!dryRun && body?.confirm !== "export") {
    return json({ error: 'exportar las llaves exige confirm: "export" (o manda dryRun: true)' }, 400);
  }

  // Última señal de vida real: el último mensaje ENTRANTE de un grupo de WhatsApp.
  const last = await db.fleetAgentMessage.findFirst({
    where: { fleetAgentId: fleetAgent.id, role: "user", groupId: { endsWith: "@g.us" } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const out = buildBaileysExport(
    {
      id: fleetAgent.id,
      name: fleetAgent.name ?? fleetAgent.id,
      baileys: fleetAgent.baileys,
      authCreds: fleetAgent.authCreds,
      authKeys: fleetAgent.authKeys,
      enabledGroups: fleetAgent.enabledGroups,
      mainGroupJid: fleetAgent.mainGroupJid,
      seenGroups: fleetAgent.seenGroups,
      lastInboundAt: last?.createdAt ?? null,
    },
    { dryRun },
  );

  if (!dryRun) {
    // Auditoría SIN secretos: quién, qué agente, qué número y cuántas llaves.
    console.log(
      `[baileys-export] user=${ctx.user.id} key=${ctx.apiKey?.id ?? "session"} fleetAgent=${fleetAgent.id} ` +
        `phone=${out.phone ?? "-"} health=${out.health} keys=${out.keyCount} groups=${Object.keys(out.groups).length}`,
    );
  }
  return json(out);
}
