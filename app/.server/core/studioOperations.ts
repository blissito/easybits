import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import {
  openAgentMessageStream,
  exposeSandboxPort,
  exposeSandboxRawPort,
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

async function loadStudioRow(ctx: AuthContext, agentId: string): Promise<StudioRow> {
  const row = await db.agent.findUnique({ where: { id: agentId } });
  if (!row || row.ownerId !== ctx.user.id) throw new Error("agent not found");
  if (!STUDIO_TEMPLATES.has(row.template)) {
    throw new Error(
      `studio unavailable for template "${row.template}" — supported: ${[...STUDIO_TEMPLATES].join(", ")}`
    );
  }
  if (row.status !== "running") throw new Error(`agent is ${row.status}; cannot use studio`);
  return {
    id: row.id,
    ownerId: row.ownerId,
    sandboxId: row.sandboxId,
    embedToken: row.embedToken,
    template: row.template,
  };
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
}

// createRoom exposes the three box surfaces (control HTTP, signaling HTTP, media
// UDP via L4) and returns the join link. The meet page mints its own per-visitor
// token from the box and derives the WSS signaling URL from its own subdomain.
export async function createRoom(
  ctx: AuthContext,
  agentId: string,
  room?: string
): Promise<StudioRoom> {
  requireScope(ctx, "WRITE");
  const row = await loadStudioRow(ctx, agentId);
  const roomName = (room && room.trim()) || `studio-${Date.now().toString(36)}`;
  const [control, , mediaFwd] = await Promise.all([
    exposeSandboxPort(ctx, row.sandboxId, CONTROL_PORT),
    exposeSandboxPort(ctx, row.sandboxId, SIGNAL_PORT),
    exposeSandboxRawPort(ctx, row.sandboxId, MEDIA_PORT, "udp"),
  ]);
  const base = control.url.replace(/\/$/, "");

  // Tell LiveKit the public host port it must announce in ICE candidates.
  // Each VM gets a unique host port (49000-49999) so multiple studios can run
  // in parallel without colliding on the same UDP port on the host.
  if (mediaFwd.ok) {
    await boxAdmin(row, "POST", "/admin/livekit/reconfigure", {
      nodePort: mediaFwd.hostPort,
    }).catch((e) => console.warn("livekit reconfigure:", e));
  }

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
      access: "public",
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
export async function ingestRecording(embedToken: string, file: string, bytes: number) {
  if (!/^[\w.-]+\.(mp4|txt)$/.test(file)) throw new Error("bad file");
  const agent = await db.agent.findUnique({ where: { embedToken } });
  if (!agent) throw new Error("agent not found");
  if (agent.template !== "livekit-svc") throw new Error("not a studio agent");
  const owner = await db.user.findUnique({ where: { id: agent.ownerId } });
  if (!owner) throw new Error("owner not found");
  const ctx = { user: owner, scopes: ["READ", "WRITE"] } as AuthContext;

  const isTxt = file.endsWith(".txt");
  const contentType = isTxt ? "text/plain" : "video/mp4";

  // URL del archivo en el box (control port sirve /rec/<file>).
  const exposed = await exposeSandboxPort(ctx, agent.sandboxId, CONTROL_PORT);
  const boxUrl = exposed.url.replace(/\/$/, "") + "/rec/" + file;

  // Crear el File + presigned PUT, jalar el contenido del box y subirlo.
  const { uploadFile } = await import("./operations");
  const { file: fileRec, putUrl } = await uploadFile(ctx, {
    fileName: file,
    contentType,
    size: bytes > 0 ? bytes : 1,
    access: isTxt ? "private" : "public",
    source: "studio",
  });
  const resp = await fetch(boxUrl);
  if (!resp.ok) throw new Error("fetch box file " + resp.status);
  const buf = Buffer.from(await resp.arrayBuffer());
  const put = await fetch(putUrl, {
    method: "PUT", headers: { "Content-Type": contentType, "Content-Length": String(buf.length) }, body: buf,
  });
  if (!put.ok) throw new Error("PUT " + put.status);

  return { ok: true, fileId: fileRec.id, url: fileRec.url, captionJobId: null };
}
