import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { openAgentMessageStream, messageAgent, exposeSandboxPort } from "./sandboxOperations";

// El box sirve los mp4 con Range (seek) en este puerto dedicado; easybits lo expone
// como un host público propio (sb-<id>-6081.sandboxes.easybits.cloud). Lo separamos
// del :6080 (noVNC, sin Range) para que el <video> permita scrubbing.
const REC_PORT = 6081;

// Grabación del escritorio de un agente computer-use. El box (computer-ghosty-gemini)
// graba el display :0 con ffmpeg → mp4 bajo el web root de noVNC (/usr/share/novnc/
// recordings), que el :6080 YA expone públicamente. Aquí NO subimos bytes a ningún
// lado: componemos la URL pública desde el desktopUrl del agente y la devolvemos.
// "El MCP devuelve la grabación" = devuelve esa URL. Vive mientras la VM corra.

// Solo este template implementa los endpoints /admin/recording*. Añadir aquí cuando
// computer-ghosty (Claude) porte el módulo ffmpeg.
const RECORDING_TEMPLATES = new Set(["computer-ghosty-gemini"]);

interface ComputerAgentRow {
  id: string;
  ownerId: string;
  sandboxId: string;
  embedToken: string;
  template: string;
  desktopUrl: string;
}

async function loadComputerAgentRow(
  ctx: AuthContext,
  agentId: string
): Promise<ComputerAgentRow> {
  const row = await db.agent.findUnique({ where: { id: agentId } });
  if (!row || row.ownerId !== ctx.user.id) {
    throw new Error("agent not found");
  }
  if (!RECORDING_TEMPLATES.has(row.template)) {
    throw new Error(
      `recording unavailable for template "${row.template}" — supported: ${[...RECORDING_TEMPLATES].join(", ")}`
    );
  }
  if (row.status !== "running") {
    throw new Error(`agent is ${row.status}; cannot record`);
  }
  return {
    id: row.id,
    ownerId: row.ownerId,
    sandboxId: row.sandboxId,
    embedToken: row.embedToken,
    template: row.template,
    desktopUrl: row.desktopUrl ?? "",
  };
}

// Llama un endpoint /admin/* del box (puerto 3000) vía el proxy de sandbox-host y
// devuelve el JSON parseado. El Bearer es el embedToken — el box lo recibe como
// ADMIN_TOKEN (inyectado en createAgent). Mismo patrón que skillsOperations.
async function boxAdmin<T = unknown>(
  row: ComputerAgentRow,
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T> {
  const { stream } = await openAgentMessageStream(row.sandboxId, row.ownerId, {
    port: 3000,
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

// Expone el :6081 del box (static server con Range) y devuelve su base pública
// (https://sb-<id>-6081.sandboxes.easybits.cloud). Idempotente: sólo añade el puerto
// al allowlist del sandbox. El subdominio inadivinable ES la capability.
async function recBase(ctx: AuthContext, row: ComputerAgentRow): Promise<string> {
  const exposed = await exposeSandboxPort(ctx, row.sandboxId, REC_PORT);
  return exposed.url.replace(/\/$/, "");
}

// URL pública del mp4 (con Range → seek). El static server sirve REC_DIR en la raíz.
const recUrl = (base: string, id: string): string => `${base}/${id}.mp4`;

export interface RecordingResult {
  recording: boolean;
  id?: string;
  url?: string;
  startedAt?: string;
  bytes?: number;
  durationMs?: number;
}

export async function startRecording(ctx: AuthContext, agentId: string): Promise<RecordingResult> {
  requireScope(ctx, "WRITE");
  const row = await loadComputerAgentRow(ctx, agentId);
  const [r, base] = await Promise.all([
    boxAdmin<RecordingResult>(row, "POST", "/admin/recording/start"),
    recBase(ctx, row),
  ]);
  return { ...r, url: r.id ? recUrl(base, r.id) : undefined };
}

export async function stopRecording(ctx: AuthContext, agentId: string): Promise<RecordingResult> {
  requireScope(ctx, "WRITE");
  const row = await loadComputerAgentRow(ctx, agentId);
  const [r, base] = await Promise.all([
    boxAdmin<RecordingResult>(row, "POST", "/admin/recording/stop"),
    recBase(ctx, row),
  ]);
  return { ...r, url: r.id ? recUrl(base, r.id) : undefined };
}

export interface RecordingEntry {
  id: string;
  url: string;
  bytes: number;
  at: string;
  recording: boolean;
}

export async function listRecordings(ctx: AuthContext, agentId: string): Promise<RecordingEntry[]> {
  requireScope(ctx, "READ");
  const row = await loadComputerAgentRow(ctx, agentId);
  const [r, base] = await Promise.all([
    boxAdmin<{ recordings?: Array<Omit<RecordingEntry, "url">> }>(row, "GET", "/admin/recordings"),
    recBase(ctx, row),
  ]);
  return (r.recordings ?? []).map((e) => ({ ...e, url: recUrl(base, e.id) }));
}

// One-shot: graba → manda el prompt y espera a que el agente termine el turno →
// detiene → devuelve la URL del mp4. UNA llamada = una grabación del agente
// haciendo la tarea. (messageAgent bloquea hasta que el turno cierra el stream;
// su `content` queda vacío para este box —emite type:"token", no "chunk"— pero
// solo lo usamos para AWAIT el turno, no para el texto.)
export async function recordTask(
  ctx: AuthContext,
  agentId: string,
  prompt: string,
  sessionId?: string
): Promise<RecordingResult & { prompt: string }> {
  requireScope(ctx, "WRITE");
  const row = await loadComputerAgentRow(ctx, agentId);
  await boxAdmin(row, "POST", "/admin/recording/start");
  // Aunque el turno falle, detenemos igual para no dejar ffmpeg colgado.
  try {
    await messageAgent(ctx, { agentId, content: prompt, sessionId });
  } catch (e) {
    await boxAdmin(row, "POST", "/admin/recording/stop").catch(() => {});
    throw e;
  }
  const [stopped, base] = await Promise.all([
    boxAdmin<RecordingResult>(row, "POST", "/admin/recording/stop"),
    recBase(ctx, row),
  ]);
  return {
    ...stopped,
    url: stopped.id ? recUrl(base, stopped.id) : undefined,
    prompt,
  };
}
