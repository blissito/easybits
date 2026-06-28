import type { Route } from "./+types/fleet-agents.$fleetAgentId.waba-inbox";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";

// GET /api/v2/fleet-agents/:fleetAgentId/waba-inbox?integrationId=...
//
// Inbox de un número WABA para el dashboard: lista las conversaciones (quién le
// escribe al agente) desde FleetAgentMessage, con su último mensaje y si está
// silenciada (modo "all") o permitida (modo "only"). On-demand (no infla el loader
// principal de /dash/flota). Auth = dueño del FleetAgent.

const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "").replace(/^521/, "52");

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  const fleetAgentId = params.fleetAgentId!;
  const url = new URL(request.url);
  const integrationId = url.searchParams.get("integrationId") ?? "";

  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: fleetAgentId } });
  if (!fleetAgent || fleetAgent.ownerId !== user.id) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const org = ((fleetAgent.wabaConfig as { orgs?: Record<string, any> } | null)?.orgs ?? {})[integrationId] ?? {};
  const muted = new Set(((org.mutedSenders as string[] | undefined) ?? []).map(onlyDigits));
  const allowed = new Set(((org.allowedSenders as string[] | undefined) ?? []).map(onlyDigits));
  // Auto-pausa por coexistencia (espeja waba.message.ts: 30 min desde tu último eco,
  // salvo que hayas reactivado después). Para mostrar "⏸ En pausa" + botón Reactivar.
  const PAUSE_WINDOW_MS = 30 * 60 * 1000;
  const pausedAt = (org.pausedAt as Record<string, string> | undefined) ?? {};
  const resumedAt = (org.resumedAt as Record<string, string> | undefined) ?? {};
  const isPaused = (digits: string) => {
    const p = pausedAt[digits];
    if (!p || Date.now() - Date.parse(p) >= PAUSE_WINDOW_MS) return false;
    const r = resumedAt[digits];
    return !(r && Date.parse(r) >= Date.parse(p));
  };

  // Mensajes recientes de las conversaciones de ESTE número (waba:<int>:<sender>).
  const prefix = `waba:${integrationId}:`;
  const rows = await db.fleetAgentMessage.findMany({
    where: { fleetAgentId, groupId: { startsWith: prefix } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { groupId: true, sender: true, role: true, text: true, createdAt: true },
  });

  // Agrupar por conversación (groupId). El teléfono = sufijo tras el prefijo.
  const byConv = new Map<string, { sender: string; lastText: string; lastRole: string; lastAt: Date; count: number }>();
  for (const r of rows) {
    const phone = r.sender || r.groupId.slice(prefix.length);
    const cur = byConv.get(r.groupId);
    if (!cur) {
      byConv.set(r.groupId, { sender: phone, lastText: r.text, lastRole: r.role, lastAt: r.createdAt, count: 1 });
    } else {
      cur.count++;
    }
  }
  const conversations = [...byConv.values()]
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, 50)
    .map((c) => ({
      sender: c.sender,
      lastText: c.lastText.length > 80 ? c.lastText.slice(0, 80) + "…" : c.lastText,
      lastRole: c.lastRole,
      lastAt: c.lastAt.toISOString(),
      count: c.count,
      muted: muted.has(onlyDigits(c.sender)),
      allowed: allowed.has(onlyDigits(c.sender)),
      paused: isPaused(onlyDigits(c.sender)),
    }));

  // no-store: data dinámica; evita que el reload tras un toggle traiga caché viejo.
  return Response.json(
    { conversations, respectEchoes: org.respectEchoes !== false },
    { headers: { "Cache-Control": "no-store" } }
  );
}
