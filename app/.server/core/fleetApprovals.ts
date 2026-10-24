// Aprobaciones de la flota: una tool que las reglas del agente marcan `ask` (lib/toolPolicy.ts)
// no corre hasta que una PERSONA la aprueba. El worker pregunta aquí (checkToolApproval) y, si
// no hay aprobación vigente para esa llamada exacta, se crea una y la tool se niega con el motivo.
// Aprobada, la siguiente vez que el agente haga ESA llamada (misma tool y argumentos, misma
// conversación, ≤ 24 h) pasa una sola vez.
//
// Reglas que hacen que sirva:
// - El resumen de la tarjeta lo arma el servidor con la tool y sus argumentos, nunca con texto
//   del modelo.
// - Decide sólo la sesión del dueño o una liga firmada de un solo uso que viaja en el webhook a
//   la superficie (Ghosty Studio, Teams, Denik). NUNCA una llave que la caja del agente pueda
//   ver (EASYBITS_API_KEY, FLEET_TOKEN): si no, el agente se aprobaría a sí mismo.
// - Estados propios (awaiting/approved/denied/used/expired) en AgentAction: el copiloto de crons
//   sólo mira `pending` y nunca las toma.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "~/.server/db";
import { dispatchWebhooks } from "~/.server/webhooks";

export const APPROVAL_TTL_MS = 24 * 60 * 60_000;

export type ApprovalDecision = "approve" | "deny";
export type FleetApprovalView = {
  id: string;
  fleetAgentId: string;
  groupId: string;
  tool: string;
  summary: string;
  status: string;
  createdAt: string;
  expiresAt: string;
};

const appUrl = () => (process.env.APP_URL || process.env.BASE_URL || "https://www.easybits.cloud").replace(/\/$/, "");
const secret = () => process.env.APPROVAL_SECRET || process.env.SECRET || "dev";

/** JSON con llaves ordenadas: la misma llamada da la misma huella aunque cambie el orden. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

export const inputHash = (tool: string, input: unknown) => createHash("sha256").update(`${tool}\n${stable(input)}`).digest("hex").slice(0, 32);

/** Credenciales tapadas en lo que se guarda y se enseña. */
function mask(s: string): string {
  return s
    .replace(/\b([A-Z0-9_]*(SECRET|TOKEN|KEY|PASSWORD|PASS|PWD)[A-Z0-9_]*)=("[^"]*"|'[^']*'|\S+)/gi, "$1=***")
    .replace(/:\/\/[^\s/@:]+:[^\s/@]+@/g, "://***@")
    .replace(/\b(Bearer|token)\s+[\w.\-]{12,}/gi, "$1 ***")
    .replace(/\b(gh[pousr]_|github_pat_|sk-|gat_|gsk_|eb_sk_|dk_|dnk_pub_)[\w-]{8,}/g, "$1***");
}

/** Los argumentos tal cual (tapados) si caben; si no, sólo un aviso: la tarjeta usa el resumen. */
function safeArgs(input: unknown): Prisma.InputJsonObject {
  try {
    const json = mask(JSON.stringify(input ?? {}));
    if (json.length <= 8000) return JSON.parse(json);
  } catch {
    /* argumentos que no son JSON */
  }
  return { omitted: "argumentos demasiado grandes" };
}

const toolLabel = (tool: string) => tool.replace(/^mcp__([^_]+(?:_[^_]+)*?)__/, "$1 · ");

/** «denik · create_booking — {"service":"Corte","date":"2026-10-25"}», desde datos, no del modelo. */
export function approvalSummary(tool: string, input: unknown): string {
  const cmd = input && typeof input === "object" && typeof (input as { command?: unknown }).command === "string" ? (input as { command: string }).command : null;
  const args = mask(cmd ?? stable(input)).replace(/\s+/g, " ");
  return `${toolLabel(tool)} — ${args.length > 220 ? args.slice(0, 219) + "…" : args}`;
}

const sign = (id: string, d: ApprovalDecision) => createHmac("sha256", secret()).update(`${id}:${d}`).digest("base64url");

export function verifyDecisionSig(id: string, d: ApprovalDecision, sig: string): boolean {
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(id, d));
  return a.length === b.length && timingSafeEqual(a, b);
}

const decideUrl = (id: string, d: ApprovalDecision) => `${appUrl()}/api/v2/fleet-agents/approvals/${id}/${d}?sig=${sign(id, d)}`;

const view = (a: { id: string; fleetAgentId: string | null; groupId: string | null; tool: string; summary: string; status: string; createdAt: Date }): FleetApprovalView => ({
  id: a.id,
  fleetAgentId: a.fleetAgentId ?? "",
  groupId: a.groupId ?? "",
  tool: a.tool,
  summary: a.summary,
  status: a.status,
  createdAt: a.createdAt.toISOString(),
  expiresAt: new Date(a.createdAt.getTime() + APPROVAL_TTL_MS).toISOString(),
});

const live = () => ({ gt: new Date(Date.now() - APPROVAL_TTL_MS) });

/**
 * Lo que pregunta el worker antes de correr una tool `ask`. Aprobada y sin usar → `allow` (y se
 * marca usada: pasa UNA vez). Si no, reusa la pendiente de esa misma llamada o crea una, avisa
 * (webhook + Sitios) y regresa `ask` con su resumen.
 */
export async function checkToolApproval(p: { fleetAgentId: string; ownerId: string; groupId: string; tool: string; input: unknown }) {
  const hash = inputHash(p.tool, p.input);
  const base = { fleetAgentId: p.fleetAgentId, groupId: p.groupId, inputHash: hash, createdAt: live() };
  const ok = await db.agentAction.findFirst({ where: { ...base, status: "approved" }, orderBy: { createdAt: "desc" } });
  if (ok) {
    // Reclamo condicionado: dos llamadas idénticas en paralelo no gastan la misma aprobación dos veces.
    const took = await db.agentAction.updateMany({ where: { id: ok.id, status: "approved" }, data: { status: "used", usedAt: new Date() } });
    if (took.count === 1) return { decision: "allow" as const, approvalId: ok.id };
  }
  const denied = await db.agentAction.findFirst({ where: { ...base, status: "denied" }, orderBy: { createdAt: "desc" } });
  if (denied) return { decision: "deny" as const, approvalId: denied.id, summary: denied.summary };
  const open = await db.agentAction.findFirst({ where: { ...base, status: "awaiting" } });
  if (open) return { decision: "ask" as const, approvalId: open.id, summary: open.summary };
  const summary = approvalSummary(p.tool, p.input);
  const row = await db.agentAction.create({
    data: { ownerId: p.ownerId, fleetAgentId: p.fleetAgentId, groupId: p.groupId, inputHash: hash, tool: p.tool.slice(0, 200), args: safeArgs(p.input), summary, status: "awaiting" },
  });
  const v = view(row);
  void dispatchWebhooks(p.ownerId, "agent.approval_requested", {
    approvalId: v.id,
    fleetAgentId: v.fleetAgentId,
    groupId: v.groupId,
    tool: v.tool,
    summary: v.summary,
    expiresAt: v.expiresAt,
    approveUrl: decideUrl(v.id, "approve"),
    denyUrl: decideUrl(v.id, "deny"),
  }).catch(() => undefined);
  // Sitios: la tarjeta sale en el chat del turno en curso.
  if (v.groupId.startsWith("site:")) {
    const { emitApproval } = await import("./siteTurns.server");
    emitApproval(v.fleetAgentId, v.groupId, { id: v.id, tool: v.tool, summary: v.summary, expiresAt: v.expiresAt });
  }
  return { decision: "ask" as const, approvalId: v.id, summary };
}

export async function listFleetApprovals(ownerId: string, opts: { fleetAgentId?: string; groupId?: string; status?: string } = {}) {
  const rows = await db.agentAction.findMany({
    where: {
      ownerId,
      fleetAgentId: opts.fleetAgentId ? opts.fleetAgentId : { not: null },
      ...(opts.groupId ? { groupId: opts.groupId } : {}),
      status: opts.status ?? "awaiting",
      createdAt: live(),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(view);
}

export class ApprovalError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Decide una aprobación pendiente (una sola vez, con update condicionado). */
export async function resolveFleetApproval(id: string, decision: ApprovalDecision, by: { ownerId?: string; resolvedBy: string }) {
  if (!/^[0-9a-f]{24}$/.test(id)) throw new ApprovalError("Aprobación no encontrada", 404);
  const res = await db.agentAction.updateMany({
    where: { id, status: "awaiting", fleetAgentId: { not: null }, createdAt: live(), ...(by.ownerId ? { ownerId: by.ownerId } : {}) },
    data: { status: decision === "approve" ? "approved" : "denied", resolvedAt: new Date(), resolvedBy: by.resolvedBy },
  });
  const row = await db.agentAction.findUnique({ where: { id } });
  if (!row || (by.ownerId && row.ownerId !== by.ownerId)) throw new ApprovalError("Aprobación no encontrada", 404);
  if (res.count !== 1) throw new ApprovalError(`Esta aprobación ya no está pendiente (${row.status})`, 409);
  void dispatchWebhooks(row.ownerId, "agent.approval_resolved", {
    approvalId: row.id,
    fleetAgentId: row.fleetAgentId,
    groupId: row.groupId,
    tool: row.tool,
    decision,
    resolvedBy: by.resolvedBy,
  }).catch(() => undefined);
  return view(row);
}

/** Retención: aprobaciones vencidas o usadas de más de 30 días y bitácora de más de 90. */
export async function purgeGovernance(now = Date.now()) {
  const approvals = await db.agentAction.deleteMany({
    where: { fleetAgentId: { not: null }, createdAt: { lt: new Date(now - 30 * 86_400_000) } },
  });
  const logs = await db.toolCallLog.deleteMany({ where: { createdAt: { lt: new Date(now - 90 * 86_400_000) } } });
  return { approvalsPurged: approvals.count, toolCallLogsPurged: logs.count };
}
