import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import {
  openAgentMessageStream,
  exposeSandboxPort,
  exposeSandboxRawPort,
  type RawForwardResult,
} from "./sandboxOperations";

// Studio = self-hosted recording box (template livekit-svc). It runs a LiveKit
// SFU + a server-side recorder (chromium+ffmpeg) and serves a Zoom-like meet
// page. The agent drives the whole flow: create a room (get a join link),
// start/stop recording, and fetch the finished MP4 — all via these ops. The MP4
// lives on the VM and is served (with Range) from the control port; the
// unguessable capability subdomain is the gate, like computer-use recordings.

const STUDIO_TEMPLATES = new Set(["livekit-svc"]);

// Box surfaces. Control = meet page + token mint + /admin/* + the Range MP4
// server (HTTP/L7). Signal = LiveKit WS signaling (HTTP/L7). Media = LiveKit
// UDP, which needs the raw L4 DNAT (expose-raw), not the HTTP proxy.
const CONTROL_PORT = 8088;
const SIGNAL_PORT = 7880;
const MEDIA_PORT = 7882;

interface StudioRow {
  id: string;
  ownerId: string;
  sandboxId: string;
  embedToken: string;
  template: string;
}

// Acepta agentId (fila en db.agent) O sandboxId directo (sandbox puro sin
// agente, como los creados por studio_spawn / spawnStudio). En el caso sandbox
// puro, ADMIN_TOKEN es el embedToken que sandbox-host inyecta = el sandboxId
// mismo (con prefijo); usamos el sandboxId como bearer de control.
async function loadStudioRow(ctx: AuthContext, agentOrSandboxId: string): Promise<StudioRow> {
  // Solo consulta db.agent si el ID parece un MongoDB ObjectID (24 hex).
  // Un sandboxId tiene formato distinto (sb_xxx / UUID) y causaría
  // "malformed ObjectID" si se lo pasamos a Prisma/Mongo.
  const looksLikeObjectId = /^[0-9a-f]{24}$/.test(agentOrSandboxId);
  const row = looksLikeObjectId
    ? await db.agent.findUnique({ where: { id: agentOrSandboxId } })
    : null;
  if (row) {
    if (row.ownerId !== ctx.user.id) throw new Error("agent not found");
    if (!STUDIO_TEMPLATES.has(row.template)) {
      throw new Error(
        `studio unavailable for template "${row.template}" — supported: ${[...STUDIO_TEMPLATES].join(", ")}`
      );
    }
    if (row.status !== "running") throw new Error(`agent is ${row.status}; cannot use studio`);
    return { id: row.id, ownerId: row.ownerId, sandboxId: row.sandboxId, embedToken: row.embedToken, template: row.template };
  }

  // No es agente — trata como sandboxId directo (livekit-svc sandbox puro).
  // El ADMIN_TOKEN del box es su embedToken, que para sandboxes puros
  // es el token generado por createSandbox (guardado en sandbox metadata).
  const { getSandbox } = await import("./sandboxOperations");
  const sb = await getSandbox(ctx, agentOrSandboxId).catch(() => null);
  if (!sb) throw new Error("sandbox not found or not owned by you");
  if (!STUDIO_TEMPLATES.has(sb.template)) {
    throw new Error(`studio unavailable for template "${sb.template}"`);
  }
  if (sb.status !== "running") throw new Error(`sandbox is ${sb.status}; cannot use studio`);
  // Para sandboxes puros el ADMIN_TOKEN es el embedToken guardado en metadata.
  const embedToken = sb.metadata?.["embedToken"] ?? agentOrSandboxId;
  return { id: agentOrSandboxId, ownerId: ctx.user.id, sandboxId: agentOrSandboxId, embedToken, template: sb.template };
}

// Call an /admin/* endpoint on the control port. Bearer = embedToken, which the
// box receives as ADMIN_TOKEN. Same transport as recordingOperations.boxAdmin.
async function boxAdmin<T = unknown>(
  row: StudioRow,
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T> {
  const { stream } = await openAgentMessageStream(row.sandboxId, row.ownerId, {
    port: CONTROL_PORT,
    path,
    method,
    headers: {
      Authorization: `Bearer ${row.embedToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    rawBody: body ?? {},
  });
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`box returned non-JSON for ${method} ${path}: ${text.slice(0, 200)}`);
  }
}

async function controlBase(ctx: AuthContext, row: StudioRow): Promise<string> {
  const exposed = await exposeSandboxPort(ctx, row.sandboxId, CONTROL_PORT);
  return exposed.url.replace(/\/$/, "");
}

// Public URL of a recording (Range-capable → seek). The box serves files at
// /rec/<file> on the control port.
const recUrl = (base: string, file: string): string => `${base}/rec/${file}`;

export interface StudioRoom {
  room: string;
  roomUrl: string;
  agentId?: string; // set by spawnStudio
}

// spawnStudio: crea el sandbox livekit-svc, espera que arranque (~15s) y
// devuelve el link de sala listo para compartir. Una sola tool para el flujo
// WhatsApp/chat: "arma una sala" → link. El sandboxId se devuelve para que el
// agente pueda luego llamar studio_start/stop_recording con él.
export async function spawnStudio(
  ctx: AuthContext,
  room?: string
): Promise<StudioRoom & { sandboxId: string }> {
  requireScope(ctx, "WRITE");
  const { createSandbox, getSandbox } = await import("./sandboxOperations");

  // 1. Generar ADMIN_TOKEN y crear el sandbox livekit-svc (TTL 3h).
  //    El token viaja como env (el box lo recibe como ADMIN_TOKEN) y se guarda
  //    en metadata para que loadStudioRow lo recupere en llamadas subsecuentes.
  const { randomBytes } = await import("node:crypto");
  const adminToken = "sb_" + randomBytes(24).toString("hex");
  // LK_API_KEY / LK_API_SECRET son internos al box (LiveKit corre dentro de la VM
  // aislada). El secret se genera por instancia para que no sea predecible.
  const lkApiKey = "lkdev";
  const lkApiSecret = randomBytes(32).toString("hex");
  const sb = await createSandbox(ctx, {
    template: "livekit-svc",
    timeoutSeconds: 3 * 3600,
    name: room ? `studio-${room}` : "studio",
    metadata: { embedToken: adminToken },
  });

  // 2. Esperar a que arranque el microVM (sandbox-agent listo).
  const start = Date.now();
  let status: string = sb.status;
  while (status !== "running" && Date.now() - start < 60_000) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await getSandbox(ctx, sb.sandboxId).catch(() => null);
    status = s?.status ?? status;
  }
  if (status !== "running") throw new Error("studio sandbox did not start in time");

  // 3. Exponer el puerto UDP raw PRIMERO — necesitamos el hostPort para
  //    pasarlo como NODE_PORT a livekit-start, que escribe el yaml en el
  //    primer boot. Así LiveKit anuncia el puerto correcto desde el inicio
  //    y no hay necesidad de reconfigurarlo después.
  const mediaFwd = await exposeSandboxRawPort(ctx, sb.sandboxId, MEDIA_PORT, "udp");

  // 4. Arrancar el runtime livekit con NODE_PORT ya conocido.
  //    startAgent escribe /etc/livekit-runtime/.env y hace
  //    systemctl enable+restart livekit-runtime. Espera /health OK (≤45s).
  const { startAgent } = await import("./sandboxOperations");
  await startAgent(ctx, sb.sandboxId, {
    unit: "livekit-runtime",
    envFile: "/etc/livekit-runtime/.env",
    port: CONTROL_PORT,
    healthPath: "/health",
    timeoutSeconds: 45,
    env: {
      LK_API_KEY: lkApiKey,
      LK_API_SECRET: lkApiSecret,
      ADMIN_TOKEN: adminToken,
      EASYBITS_INGEST_URL: "https://www.easybits.cloud/api/v2/studio/ingest",
      // Salas efímeras (call_create) NO tienen fila en la DB de easybits, así que
      // el ingest no puede resolver al dueño por embedToken. El box reenvía estos
      // dos en el payload del ingest; el embedToken sigue siendo la capability.
      EASYBITS_OWNER: ctx.user.id,
      EASYBITS_SANDBOX_ID: sb.sandboxId,
      NODE_PORT: String(mediaFwd.ok ? mediaFwd.hostPort : MEDIA_PORT),
    },
  });

  // 5. Exponer puertos HTTP + crear sala (el UDP ya está expuesto arriba).
  const result = await createRoom(ctx, sb.sandboxId, room, mediaFwd);
  return { ...result, sandboxId: sb.sandboxId };
}

// createRoom exposes the three box surfaces (control HTTP, signaling HTTP, media
// UDP via L4) and returns the join link. The meet page mints its own per-visitor
// token from the box and derives the WSS signaling URL from its own subdomain.
export async function createRoom(
  ctx: AuthContext,
  agentId: string,
  room?: string,
  preExposedMedia?: RawForwardResult
): Promise<StudioRoom> {
  requireScope(ctx, "WRITE");
  const row = await loadStudioRow(ctx, agentId);
  const roomName = (room && room.trim()) || `studio-${Date.now().toString(36)}`;
  // Expose HTTP ports (control + signal). Media UDP is either pre-exposed by
  // spawnStudio (NODE_PORT already baked into livekit-start env) or we expose
  // it now for standalone createRoom calls (e.g. adding rooms to existing VM).
  const [control] = await Promise.all([
    exposeSandboxPort(ctx, row.sandboxId, CONTROL_PORT),
    exposeSandboxPort(ctx, row.sandboxId, SIGNAL_PORT),
    preExposedMedia ? Promise.resolve(preExposedMedia) : exposeSandboxRawPort(ctx, row.sandboxId, MEDIA_PORT, "udp"),
  ]);
  const base = control.url.replace(/\/$/, "");
  return { room: roomName, roomUrl: `${base}/room?room=${encodeURIComponent(roomName)}` };
}

export interface StudioRecording {
  recording: boolean;
  id?: string;
  room?: string;
  file?: string;
  url?: string;
  startedAt?: string;
  bytes?: number;
  fileId?: string;
  uploadError?: string;
}

export async function startStudioRecording(
  ctx: AuthContext,
  agentId: string,
  room: string
): Promise<StudioRecording> {
  requireScope(ctx, "WRITE");
  const row = await loadStudioRow(ctx, agentId);
  return boxAdmin<StudioRecording>(row, "POST", "/admin/recording/start", { room });
}

// stopStudioRecording finalizes the MP4 and persists it to the owner's easybits
// Files (the recording is a GENERATION, like every other asset). It creates a
// File + presigned PUT, has the box upload the MP4 straight to S3, and returns
// the permanent File URL — so the recording outlives the VM (TTL/destroy). If
// the upload fails it falls back to the box's temporary URL so nothing is lost.
export async function stopStudioRecording(
  ctx: AuthContext,
  agentId: string
): Promise<StudioRecording> {
  requireScope(ctx, "WRITE");
  const row = await loadStudioRow(ctx, agentId);
  const r = await boxAdmin<StudioRecording>(row, "POST", "/admin/recording/stop");
  if (!r.file) return r;

  try {
    const { uploadFile } = await import("./operations");
    const { file, putUrl } = await uploadFile(ctx, {
      fileName: r.file,
      contentType: "video/mp4",
      size: r.bytes && r.bytes > 0 ? r.bytes : 1,
      access: "private",
      source: "studio",
    });
    await boxAdmin(row, "POST", "/admin/recording/upload", {
      file: r.file,
      putUrl,
      contentType: "video/mp4",
    });
    return { ...r, fileId: file.id, url: file.url || undefined };
  } catch (e) {
    const base = await controlBase(ctx, row);
    return { ...r, url: recUrl(base, r.file), uploadError: String((e as Error).message || e) };
  }
}

export interface StudioRecordingEntry {
  file: string;
  url: string;
  size: number;
  modifiedAt: string;
}

export async function listStudioRecordings(
  ctx: AuthContext,
  agentId: string
): Promise<StudioRecordingEntry[]> {
  requireScope(ctx, "READ");
  const row = await loadStudioRow(ctx, agentId);
  const [r, base] = await Promise.all([
    boxAdmin<{ recordings?: Array<Omit<StudioRecordingEntry, "url">> }>(row, "GET", "/admin/recordings"),
    controlBase(ctx, row),
  ]);
  return (r.recordings ?? []).map((e) => ({ ...e, url: recUrl(base, e.file) }));
}

// ingestRecording: el BOX (vía /rec/stop del botón de la sala) notifica una
// grabación lista. Auth por su embedToken (= ADMIN_TOKEN del box). easybits
// resuelve al dueño, sube el MP4 a sus Files (permanente, sobrevive a la VM) y
// encola el transcript/captions (best-effort). Así la grabación es una
// GENERACIÓN más en Files, sin exponer la API key del dueño en el box.
export async function ingestRecording(
  embedToken: string,
  file: string,
  bytes: number,
  ownerHint?: string,
  sandboxHint?: string
) {
  if (!/^[\w.-]+\.(mp4|txt)$/.test(file)) throw new Error("bad file");

  // Resolver dueño + sandbox. (1) Studio basado en agente (db.agent) — camino
  // histórico, embedToken en la DB. (2) Sala efímera (call_create) sin fila en
  // la DB: el box reenvía EASYBITS_OWNER/EASYBITS_SANDBOX_ID en el payload; el
  // embedToken sigue siendo la capability (solo este box lo conoce).
  const agent = await db.agent.findUnique({ where: { embedToken } });
  let ownerId: string, sandboxId: string;
  if (agent) {
    if (agent.template !== "livekit-svc") throw new Error("not a studio agent");
    ownerId = agent.ownerId; sandboxId = agent.sandboxId;
  } else {
    if (!ownerHint || !sandboxHint) throw new Error("studio not found");
    ownerId = ownerHint; sandboxId = sandboxHint;
  }
  const owner = await db.user.findUnique({ where: { id: ownerId } });
  if (!owner) throw new Error("owner not found");
  const ctx = { user: owner, scopes: ["READ", "WRITE"] } as AuthContext;

  const isTxt = file.endsWith(".txt");
  const contentType = isTxt ? "text/plain" : "video/mp4";

  // URL del archivo en el box (control port sirve /rec/<file>).
  const exposed = await exposeSandboxPort(ctx, sandboxId, CONTROL_PORT);
  const boxUrl = exposed.url.replace(/\/$/, "") + "/rec/" + file;

  // Crear el File + presigned PUT, jalar el contenido del box y subirlo.
  // PRIVADO: la grabación no debe ser pública en la web (se accede por link firmado).
  const { uploadFile } = await import("./operations");
  const { file: fileRec, putUrl } = await uploadFile(ctx, {
    fileName: file,
    contentType,
    size: bytes > 0 ? bytes : 1,
    access: "private",
    source: "studio",
  });
  const resp = await fetch(boxUrl);
  if (!resp.ok) throw new Error("fetch box file " + resp.status);
  const buf = Buffer.from(await resp.arrayBuffer());
  const put = await fetch(putUrl, {
    method: "PUT", headers: { "Content-Type": contentType, "Content-Length": String(buf.length) }, body: buf,
  });
  if (!put.ok) throw new Error("PUT " + put.status);

  // Link privado firmado (1h) para abrir/descargar la grabación.
  let url: string | null = null;
  try {
    const { getReadClientForPlatformFile } = await import("../storage");
    url = await getReadClientForPlatformFile(fileRec).getReadUrl((fileRec as { storageKey: string }).storageKey);
  } catch { /* best-effort: el File queda en Files aunque no se firme el link */ }

  return { ok: true, fileId: fileRec.id, url, access: "private", captionJobId: null };
}

// ── call_status ──────────────────────────────────────────────────────────────
// Estado del servidor de llamadas: si está grabando, quién está en la sala.
export async function getCallStatus(ctx: AuthContext, sandboxId: string) {
  requireScope(ctx, "READ");
  const row = await loadStudioRow(ctx, sandboxId);
  const [recState, participants] = await Promise.all([
    boxAdmin<{ recording: boolean; id?: string; room?: string; startedAt?: string }>(row, "GET", "/rec/state").catch(() => ({ recording: false } as { recording: boolean; room?: string; startedAt?: string })),
    boxAdmin<{ participants?: string[] }>(row, "GET", "/participants").catch(() => ({ participants: [] })),
  ]);
  return { recording: recState.recording, room: recState.room, startedAt: recState.startedAt, participants: participants.participants ?? [] };
}

// ── call_files ───────────────────────────────────────────────────────────────
// Grabaciones y transcripts permanentes en EasyBits Files (source=studio).
// Filtra directamente en DB — sobreviven aunque la VM ya haya sido destruida.
export async function listCallFiles(ctx: AuthContext) {
  requireScope(ctx, "READ");
  const files = await db.file.findMany({
    where: { ownerId: ctx.user.id, source: "studio", status: { not: "DELETED" } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, name: true, url: true, source: true, createdAt: true, contentType: true },
  });
  return files;
}

// ── call_destroy ─────────────────────────────────────────────────────────────
// Termina la llamada limpiamente:
//  1. Para grabación activa si la hay (→ sube MP4 a Files via /admin/recording/stop)
//  2. Jala TODOS los .mp4 de la VM que aún no estén en Files y los sube
//  3. Destruye el sandbox
// El agente debe llamar esto cuando la llamada haya terminado.
export async function destroyCall(ctx: AuthContext, sandboxId: string) {
  requireScope(ctx, "WRITE");
  const { destroySandbox } = await import("./sandboxOperations");
  const row = await loadStudioRow(ctx, sandboxId);

  // 1. Para grabación activa (sube MP4 via /admin/recording/stop + upload)
  await stopStudioRecording(ctx, sandboxId).catch(() => {});

  // 2. Jala cualquier .mp4 huérfano de la VM que el botón de sala haya dejado
  //    (el botón notifica al ingest en fire-and-forget; puede que aún no haya
  //    terminado). Listamos la VM y subimos los que no tienen fileId.
  try {
    const recs = await boxAdmin<{ recordings?: Array<{ file: string; size: number }> }>(row, "GET", "/admin/recordings");
    const base = await controlBase(ctx, row);
    const { uploadFile } = await import("./operations");
    for (const rec of recs.recordings ?? []) {
      if (!rec.file.endsWith(".mp4")) continue;
      try {
        const { file: f, putUrl } = await uploadFile(ctx, { fileName: rec.file, contentType: "video/mp4", size: rec.size || 1, access: "private", source: "studio" });
        const mp4 = await fetch(`${base}/rec/${rec.file}`);
        if (mp4.ok) {
          const buf = Buffer.from(await mp4.arrayBuffer());
          await fetch(putUrl, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(buf.length) }, body: buf });
          console.log("call_destroy rescued", rec.file, "→", f.id);
        }
      } catch { /* best effort por archivo */ }
    }
  } catch { /* si el box ya murió, no hay nada que rescatar */ }

  // 3. Destruir el sandbox
  await destroySandbox(ctx, sandboxId);
  return { ok: true };
}
