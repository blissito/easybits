// WABA channel core (Formmy gateway → Meta). Shared by the inbound route
// (waba.message.ts) and the dashboard (fleet-agents.tsx action): turn-running,
// reply delivery (text/media/voice), and ATOMIC per-conversation writes on the
// wabaConfig blob. Lives in .server so the dashboard route can import it without
// leaking db into the client bundle.
import { db } from "~/.server/db";
import { routeMessage } from "~/.server/core/fleetAgentOperations";
import {
  extractWabaContent,
  type WabaInboundMedia,
  type InboundContent,
} from "./inboundMedia.server";
import { deliverFilesFromReply } from "./outboundMedia.server";
import { makeWabaFileSender, sendTextToFormmy, sendVoiceToFormmy, sendReactionToFormmy, sendTypingToFormmy } from "./wabaSend";
import { wantsVoiceReply, synthesizeVoice } from "~/.server/core/fleetVoice";

// Per-integration (per Meta number) config.
export type WabaOrg = {
  phoneNumberId?: string;
  phoneNumber?: string;
  name?: string;
  systemPrompt?: string;
  denikApiKey?: string;
  // ADMIN POR CONVERSACIÓN: senders (dígitos normalizados) que administran este
  // número — sus turnos inyectan mcp__admin__* e ignoran gate/pausa. Se designan
  // desde el Inbox. Reemplaza al self-chat admin, MUERTO en WABA (Meta rechaza
  // enviar del negocio a su propio número, #100 → el note-to-self nunca regresa).
  adminSenders?: string[];
  adminSender?: string; // (legacy) un único sender admin — respetado por compat
  responseMode?: "off" | "all" | "only";
  enabled?: boolean; // legacy master ON/OFF (compat)
  allowedSenders?: string[];
  pausedUntil?: Record<string, string>;
};

export type WabaConfig = {
  formmySecret?: string;
  orgs?: Record<string, WabaOrg>;
};

// Modo efectivo (deriva de `enabled` si aún no hay `responseMode`).
export function resolveMode(org: WabaOrg | undefined): "off" | "all" | "only" {
  if (org?.responseMode) return org.responseMode;
  return org?.enabled === false ? "off" : "all";
}

// Normaliza un teléfono: quita @sufijo/no-dígitos/+ y colapsa 521 → 52 (México).
export function normalizePhone(s: string | undefined | null): string {
  let d = (s ?? "").replace(/@.*$/, "").replace(/\D/g, "");
  if (d.startsWith("521")) d = "52" + d.slice(3);
  return d;
}

// Senders admin de un número (adminSenders ∪ adminSender legacy), normalizados.
export function adminSetOf(org: WabaOrg | undefined): Set<string> {
  return new Set<string>([
    ...((org?.adminSenders ?? []).map(normalizePhone)),
    ...(org?.adminSender ? [normalizePhone(org.adminSender)] : []),
  ]);
}

// Formmy forwards media as { type, media_id, url(signed EasyBits read URL),
// mime_type, caption }. Map it to the channel-agnostic WabaInboundMedia.
export function parseDropletMedia(raw: unknown): WabaInboundMedia | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const type = typeof m.type === "string" ? m.type : "";
  const url = typeof m.url === "string" ? m.url : "";
  if (!type || !url) return null;
  return {
    type,
    url,
    mimeType:
      (typeof m.mime_type === "string" && m.mime_type) ||
      (typeof m.mimeType === "string" ? m.mimeType : undefined) ||
      undefined,
    caption: typeof m.caption === "string" ? m.caption : undefined,
    fileName:
      (typeof m.filename === "string" && m.filename) ||
      (typeof m.fileName === "string" ? m.fileName : undefined) ||
      undefined,
  };
}

// Persist an inbound user message WITHOUT running a turn (paused/muted/off) so the
// Inbox shows it and "Solicitar respuesta" can replay it. Fire-and-forget.
export async function persistInboundUserMessage(
  fleetAgentId: string,
  integrationId: string,
  sender: string,
  senderName: string,
  content: string,
  media: WabaInboundMedia | null
): Promise<void> {
  try {
    const text = content.trim() || media?.caption?.trim() || (media ? `[${media.type}]` : "");
    if (!text) return;
    // groupId normalizado (521→52) = UNA sesión por contacto, no se parte la memoria.
    const convId = normalizePhone(sender);
    await db.fleetAgentMessage.create({
      data: { fleetAgentId, groupId: `waba:${integrationId}:${convId}`, role: "user", sender: convId, senderName: senderName || null, text },
    });
  } catch (e) {
    console.error(`[waba] persistInbound ${fleetAgentId} failed:`, e instanceof Error ? e.message : e);
  }
}

// ── Coalescing por conversación (anti multi-spawn) ───────────────────────────
// WABA reenvía CADA mensaje por separado. Sin serializar, 3 mensajes rápidos
// disparaban 3 routeMessage concurrentes → 3 pickOrSpawn en carrera → 3 workers
// para UNA conversación (memoria partida + VM llena "4/4" → deja de responder).
// Igual que baileys: bufferizamos por conversación, debounce, y drenamos UN turno
// a la vez (combinando los mensajes de la ráfaga). El primer turno fija la ruta
// sticky → los siguientes reusan el MISMO worker (memoria continua).
const WABA_DEBOUNCE_MS = 1200;
type WabaCtx = {
  fleetAgentId: string;
  ownerId: string;
  formmySecret: string;
  integrationId: string;
  sender: string;
  org: WabaOrg | undefined;
  admin?: boolean;
};
type WabaItem = { content: string; media: WabaInboundMedia | null; messageId?: string; senderName?: string };
type WabaBuf = { ctx: WabaCtx; items: WabaItem[]; running: boolean; timer: ReturnType<typeof setTimeout> | null };
const wabaBuffers = new Map<string, WabaBuf>();

// Entrada del canal WABA: encola un mensaje para su conversación. Reemplaza la
// llamada directa a runWabaTurn (que causaba la carrera de spawn).
export function enqueueWabaTurn(ctx: WabaCtx, item: WabaItem): void {
  const key = `${ctx.fleetAgentId}:waba:${ctx.integrationId}:${normalizePhone(ctx.sender)}`;
  let buf = wabaBuffers.get(key);
  if (!buf) {
    buf = { ctx, items: [], running: false, timer: null };
    wabaBuffers.set(key, buf);
  }
  buf.ctx = ctx; // refresca (org/admin del mensaje más reciente)
  buf.items.push(item);
  if (buf.running) return; // se auto-drena al terminar el turno en curso
  if (buf.timer) clearTimeout(buf.timer);
  buf.timer = setTimeout(() => void drainWaba(key), WABA_DEBOUNCE_MS);
}

async function drainWaba(key: string): Promise<void> {
  const buf = wabaBuffers.get(key);
  if (!buf || buf.running || buf.items.length === 0) return;
  buf.running = true;
  buf.timer = null;
  const batch = buf.items;
  buf.items = [];
  const { ctx } = buf;
  try {
    // Coalesce: une el texto de la ráfaga, toma la PRIMERA media y el último messageId.
    const combined = batch.map((i) => i.content).filter(Boolean).join("\n");
    const media = batch.map((i) => i.media).find(Boolean) ?? null;
    const last = batch[batch.length - 1];
    const senderName = batch.map((i) => i.senderName).find(Boolean);
    const ec = await extractWabaContent(combined, media, { ownerId: ctx.ownerId });
    await runWabaTurn({
      fleetAgentId: ctx.fleetAgentId,
      ownerId: ctx.ownerId,
      formmySecret: ctx.formmySecret,
      integrationId: ctx.integrationId,
      sender: ctx.sender,
      senderName,
      org: ctx.org,
      content: ec,
      admin: ctx.admin,
      messageId: last.messageId,
    });
  } catch (e) {
    console.error(`[waba] drain ${key} failed:`, e instanceof Error ? e.message : e);
  } finally {
    buf.running = false;
    if (buf.items.length > 0) {
      // Llegaron mensajes durante el turno → drena otra vez (mismo worker sticky).
      buf.timer = setTimeout(() => void drainWaba(key), WABA_DEBOUNCE_MS);
    } else {
      wabaBuffers.delete(key);
    }
  }
}

// Run ONE WABA turn (route → reply → deliver). Shared by the coalescing drainer and
// the dashboard "Solicitar respuesta" action.
export async function runWabaTurn(args: {
  fleetAgentId: string;
  ownerId: string;
  formmySecret: string;
  integrationId: string;
  sender: string;
  senderName?: string;
  org: WabaOrg | undefined;
  content: InboundContent;
  admin?: boolean;
  skipUserLog?: boolean;
  messageId?: string;
}): Promise<void> {
  const { fleetAgentId, ownerId, formmySecret, integrationId, sender, senderName, org, content, admin, skipUserLog, messageId } = args;
  // Paridad con baileys: 👀 + "escribiendo…" al empezar el turno. Best-effort.
  if (messageId) {
    void sendReactionToFormmy(formmySecret, integrationId, sender, messageId, "👀");
    void sendTypingToFormmy(formmySecret, integrationId, sender, messageId);
  }
  // groupId (= sticky session + .jsonl transcript) normalizado por contacto: el
  // mismo número no se parte en dos sesiones (521 vs 52) → memoria continua, como
  // el jid estable de Baileys. El `sender` crudo se conserva SOLO para enviar a Meta.
  const convId = normalizePhone(sender);
  const reply = await routeMessage(
    fleetAgentId,
    {
      groupId: `waba:${integrationId}:${convId}`,
      configGroupId: `waba:${integrationId}`,
      sender,
      text: content.text,
      senderName,
      image: content.image,
      appendSystemPrompt: org?.systemPrompt,
      denikApiKey: org?.denikApiKey,
      admin,
    },
    { skipRateLimit: false, hasMedia: content.hasMedia, skipUserLog }
  );
  if (!reply) return;
  await deliverWabaReply({ formmySecret, integrationId, sender, ownerId, reply, userText: content.userText, wasVoice: content.wasVoice });
  // ✅ al terminar (paridad con baileys).
  if (messageId) void sendReactionToFormmy(formmySecret, integrationId, sender, messageId, "✅");
}

// Deliver the reply: attach file URLs (stripped from text), then voice note XOR
// remaining text (mirrors Baileys). PTT carries no waveform (Meta renders it).
async function deliverWabaReply(args: {
  formmySecret: string;
  integrationId: string;
  sender: string;
  ownerId: string;
  reply: string;
  userText?: string;
  wasVoice?: boolean;
}): Promise<void> {
  const { formmySecret, integrationId, sender, ownerId, reply, userText, wasVoice } = args;
  const fileSender = makeWabaFileSender(formmySecret, integrationId, sender);
  const { text: cleaned } = await deliverFilesFromReply(fileSender, sender, reply);
  const body = cleaned.trim();
  const voice = wantsVoiceReply(userText ?? "", !!wasVoice) ? await synthesizeVoice(ownerId, body || reply) : null;
  if (voice) await sendVoiceToFormmy(formmySecret, integrationId, sender, voice.buffer);
  else if (body) await sendTextToFormmy(formmySecret, integrationId, sender, body);
}

// "Solicitar respuesta": despausa + contesta los mensajes pendientes de una
// conversación (los `role:"user"` posteriores al último `role:"agent"`), con una
// directiva OPCIONAL del operador (one-shot, no persistente). Reactiva primero la
// pausa de coexistencia (Formmy = fuente única) y limpia el cache local.
export async function requestWabaReply(args: {
  fleetAgentId: string;
  ownerId: string;
  formmySecret: string;
  integrationId: string;
  sender: string;
  org: WabaOrg | undefined;
  directive?: string;
  resume: (formmySecret: string, integrationId: string, sender: string) => Promise<{ ok: boolean; error?: string }>;
}): Promise<{ ok: boolean; error?: string }> {
  const { fleetAgentId, ownerId, formmySecret, integrationId, sender, org, directive, resume } = args;
  // 1) Reactivar (despausar) en Formmy + limpiar el cache local de pausa.
  const r = await resume(formmySecret, integrationId, sender);
  if (!r.ok) return { ok: false, error: r.error || "no se pudo reactivar" };
  await setPausedUntilAtomic(fleetAgentId, integrationId, normalizePhone(sender), null).catch(() => {});

  // 2) Juntar los mensajes pendientes (user) posteriores al último reply del agente.
  const groupId = `waba:${integrationId}:${normalizePhone(sender)}`;
  const rows = await db.fleetAgentMessage.findMany({
    where: { fleetAgentId, groupId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { role: true, text: true },
  });
  const pending: string[] = [];
  for (const row of rows) {
    if (row.role === "agent") break;
    pending.push(row.text);
  }
  pending.reverse();
  const pendingText = pending.join("\n").trim();
  if (!pendingText && !directive?.trim()) return { ok: false, error: "no hay mensajes pendientes" };

  // 3) Componer el turno: mensajes pendientes + directiva del operador (one-shot).
  let text = pendingText;
  if (directive?.trim()) {
    text =
      (pendingText ? `${pendingText}\n\n` : "") +
      `[INSTRUCCIÓN DEL OPERADOR — redacta tu respuesta siguiéndola, NO la repitas literal: ${directive.trim()}]`;
  }

  await runWabaTurn({
    fleetAgentId,
    ownerId,
    formmySecret,
    integrationId,
    sender,
    org,
    content: { text, userText: pendingText, hasMedia: false },
    skipUserLog: true, // los pendientes ya están logueados
  });
  return { ok: true };
}

// ── Atomic per-conversation writes on wabaConfig (anti-clobber) ───────────────
// wabaConfig is a single JSON blob; read-modify-write from multiple writers loses
// updates. These target ONE nested key via $set/$unset/$addToSet/$pull so writes
// to OTHER keys never clobber. Collection = "FleetAgent", id maps to _id (ObjectId).
export async function setPausedUntilAtomic(
  fleetAgentId: string,
  integrationId: string,
  np: string,
  until: string | null
): Promise<void> {
  const path = `wabaConfig.orgs.${integrationId}.pausedUntil.${np}`;
  const u = until ? { $set: { [path]: until } } : { $unset: { [path]: "" } };
  await db.$runCommandRaw({ update: "FleetAgent", updates: [{ q: { _id: { $oid: fleetAgentId } }, u }] });
}

export async function setAdminSenderAtomic(
  fleetAgentId: string,
  integrationId: string,
  np: string,
  on: boolean
): Promise<void> {
  const path = `wabaConfig.orgs.${integrationId}.adminSenders`;
  const u = on ? { $addToSet: { [path]: np } } : { $pull: { [path]: np } };
  await db.$runCommandRaw({ update: "FleetAgent", updates: [{ q: { _id: { $oid: fleetAgentId } }, u }] });
}

export async function setAllowedSenderAtomic(
  fleetAgentId: string,
  integrationId: string,
  np: string,
  on: boolean
): Promise<void> {
  const path = `wabaConfig.orgs.${integrationId}.allowedSenders`;
  const u = on ? { $addToSet: { [path]: np } } : { $pull: { [path]: np } };
  await db.$runCommandRaw({ update: "FleetAgent", updates: [{ q: { _id: { $oid: fleetAgentId } }, u }] });
}

// Cachea (para VISIBILIDAD en el Inbox) el `paused_until` que Formmy manda por
// conversación. Lee primero (escribe solo si cambió); la escritura es atómica.
export async function recordPausedUntil(
  fleetAgentId: string,
  integrationId: string,
  np: string,
  until: string | null
): Promise<void> {
  try {
    const fa = await db.fleetAgent.findUnique({ where: { id: fleetAgentId }, select: { wabaConfig: true } });
    const org = ((fa?.wabaConfig as WabaConfig | null)?.orgs ?? {})[integrationId];
    if (!org) return;
    const cur = org.pausedUntil?.[np] ?? null;
    const want = until && Date.parse(until) > Date.now() ? until : null;
    if (cur === want) return;
    await setPausedUntilAtomic(fleetAgentId, integrationId, np, want);
  } catch (e) {
    console.error(`[waba] recordPausedUntil ${fleetAgentId}/${np} failed:`, e instanceof Error ? e.message : e);
  }
}
