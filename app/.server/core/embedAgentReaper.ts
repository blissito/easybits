// Embed-agent idle reaper — standalone claude-worker agents (no pool).
//
// denik corre 1 agente claude-worker por cliente bajo UNA cuenta de EasyBits
// (poolId=null; no son workers del pool). Para que la flota escale a N agentes
// con un cap de concurrencia chico, los suspendemos cuando llevan idle (≈0 RAM,
// solo disco) y los despertamos en el siguiente mensaje (wakeAgentForMessage en
// /api/v2/agents/:id/message). SOLO suspend, nunca destroy: cada agente tiene
// persona + estado de conversación en su volumen y no hay externalización de
// memoria como en el pool.
//
// Vive en su propio módulo (no dentro de poolOperations.ts) para no chocar con
// el trabajo del pool. Tiene su PROPIO busy-set: los ids de agentes embed son
// disjuntos de los de los workers del pool, y este reaper solo toca agentes
// poolId=null, así que no hay traslape.
import type { AuthContext } from "../apiAuth";
import { db } from "../db";
import { suspendSandbox } from "./sandboxOperations";

// Agentes con turno en vuelo, exentos del reaper. El endpoint del mensaje marca
// busy/idle alrededor del stream. In-process → válido solo single-instance
// (mismo caveat que el busyVms del pool); mover a marca en DB antes de escalar
// EasyBits a >1 instancia.
const busyEmbedAgents = new Set<string>();

export function markAgentBusy(agentId: string): void {
  busyEmbedAgents.add(agentId);
}
export function markAgentIdle(agentId: string): void {
  busyEmbedAgents.delete(agentId);
}

const EMBED_IDLE_SUSPEND_MIN = Number(process.env.EMBED_IDLE_SUSPEND_MIN || 5);

async function ctxForOwner(ownerId: string): Promise<AuthContext> {
  const user = await db.user.findUnique({ where: { id: ownerId } });
  if (!user) throw new Error(`embed agent owner ${ownerId} not found`);
  return { user, scopes: ["READ", "WRITE", "DELETE"] };
}

export async function reapIdleEmbedAgents(): Promise<{ suspended: number }> {
  let suspended = 0;
  const now = Date.now();
  const cutoff = new Date(now - EMBED_IDLE_SUSPEND_MIN * 60_000);
  const busy = [...busyEmbedAgents];

  // Standalone claude-worker agents (poolId=null) running and idle past cutoff.
  // lastMessageAt null → nunca recibió mensaje; usamos createdAt como referencia.
  const candidates = await db.agent.findMany({
    where: {
      poolId: null,
      template: "claude-worker",
      status: "running",
      id: { notIn: busy },
      OR: [
        { lastMessageAt: { lt: cutoff } },
        { lastMessageAt: null, createdAt: { lt: cutoff } },
      ],
    },
  });

  for (const a of candidates) {
    const ctx = await ctxForOwner(a.ownerId).catch(() => null);
    if (!ctx) continue;
    try {
      await suspendSandbox(ctx, a.sandboxId);
      await db.agent.update({ where: { id: a.id }, data: { status: "suspended" } });
      suspended++;
    } catch (e) {
      console.error(`embed reaper: suspend ${a.sandboxId} failed:`, e);
    }
  }
  if (suspended) {
    console.error(`[embed-reaper] suspended=${suspended} busy=${busy.length}`);
  }
  return { suspended };
}
