// ── Configuración de un agente CON máquina (ghosty-lite / goose) después de creado ──────
//
// Mismo contrato que gs (`ghosty.studio/api/v2/agents/:id/{files,skills,mcp,restart}`) para
// que la skill `ghosty-agent` sirva contra los dos con sólo cambiar base URL y token. Las
// claves JSON de las respuestas (`reiniciado`, `nota`, `en`) son las del contrato de gs.
//
// Convenciones de rutas en la caja (las lee el launcher del template):
//   /data/work/<archivo>               cwd del cerebro → archivos de conocimiento
//   /data/agent/skills/<slug>/SKILL.md skills del agente; el launcher las enlaza AL ARRANCAR
//   acpMcpServers (fila, cifrado)      MCP del dueño; viajan en `session/new`, no en config.yaml
//
// Por eso skills y MCP piden `restart`: rearranca el unit y rehace el handshake ACP.
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { encryptSecret, decryptSecret } from "../crypto";
import {
  execCommand,
  writeFile,
  ownedAgentRow,
  resumeSandbox,
  startAgent,
  resolveTemplate,
  runAcpHandshake,
  expandAcpMcpSecrets,
  normalizeAcpMcpServers,
  shQuote,
  type AcpMcpServer,
} from "./sandboxOperations";
import type { SandboxTemplate } from "../sandbox/schemas";

export const WORK_DIR = "/data/work";
export const SKILLS_DIR = "/data/agent/skills";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SKILL_BYTES = 25 * 1024 * 1024;
export const SKILL_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export class MachineConfigError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Un nombre relativo seguro: sin `..`, sin absoluto, sin caracteres raros (regla de gs). */
export function safeRelPath(raw: string): string | null {
  const p = raw.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!p || p.length > 200) return null;
  const parts = p.split("/");
  if (parts.some((x) => x === "" || x === "." || x === "..")) return null;
  if (!/^[\p{L}\p{N}._ \-/()]+$/u.test(p)) return null;
  return p;
}

// ── Archivos de conocimiento ──────────────────────────────────────────────────────────────

export async function listAgentFiles(
  ctx: AuthContext,
  agentId: string,
  sub?: string | null
): Promise<{ dir: string; files: Array<{ path: string; size: number }> }> {
  const row = await ownedAgentRow(ctx, agentId);
  const rel = sub ? safeRelPath(sub) : "";
  if (sub && rel === null) throw new MachineConfigError("ruta inválida", 400);
  const dir = rel ? `${WORK_DIR}/${rel}` : WORK_DIR;
  const r = await execCommand(ctx, row.sandboxId, {
    command: `cd ${shQuote(dir)} 2>/dev/null && find . -maxdepth 3 -type f -not -path '*/.*' -printf '%s\\t%P\\n' | head -500`,
    timeoutSeconds: 30,
  });
  const files = (r.stdout ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [size, ...rest] = line.split("\t");
      return { path: rest.join("\t"), size: Number(size) || 0 };
    });
  return { dir: rel ? `/${rel}` : "/", files };
}

export async function putAgentFile(
  ctx: AuthContext,
  agentId: string,
  relRaw: string,
  bytes: Uint8Array
): Promise<{ path: string; bytes: number; en: string }> {
  const rel = safeRelPath(relRaw);
  if (!rel) throw new MachineConfigError("ruta inválida", 400);
  if (!bytes.byteLength) throw new MachineConfigError("cuerpo vacío", 400);
  if (bytes.byteLength > MAX_FILE_BYTES) throw new MachineConfigError("archivo demasiado grande (máx 10 MB)", 413);
  const row = await ownedAgentRow(ctx, agentId);
  const abs = `${WORK_DIR}/${rel}`;
  const parent = abs.slice(0, abs.lastIndexOf("/"));
  await execCommand(ctx, row.sandboxId, { command: `mkdir -p ${shQuote(parent)}`, timeoutSeconds: 15 });
  await writeFile(ctx, row.sandboxId, { path: abs, content: Buffer.from(bytes).toString("base64"), encoding: "base64" });
  return { path: rel, bytes: bytes.byteLength, en: abs };
}

export async function deleteAgentFile(ctx: AuthContext, agentId: string, relRaw: string): Promise<{ deleted: string }> {
  const rel = safeRelPath(relRaw);
  if (!rel) throw new MachineConfigError("ruta inválida", 400);
  const row = await ownedAgentRow(ctx, agentId);
  await execCommand(ctx, row.sandboxId, { command: `rm -rf -- ${shQuote(`${WORK_DIR}/${rel}`)}`, timeoutSeconds: 15 });
  return { deleted: rel };
}

// ── Skills ────────────────────────────────────────────────────────────────────────────────

export type AgentSkillEntry = { slug: string; description: string; files: string[] };

export async function listAgentSkills(ctx: AuthContext, agentId: string): Promise<AgentSkillEntry[]> {
  const row = await ownedAgentRow(ctx, agentId);
  // Una línea por skill: slug \t description \t archivos separados por coma.
  const r = await execCommand(ctx, row.sandboxId, {
    command: `for f in ${SKILLS_DIR}/*/SKILL.md; do [ -f "$f" ] || continue; d=$(dirname "$f"); printf '%s\\t%s\\t%s\\n' "$(basename "$d")" "$(grep -m1 '^description:' "$f" | sed 's/^description:[[:space:]]*//; s/^"//; s/"$//')" "$(cd "$d" && find . -type f -printf '%P,' )"; done`,
    timeoutSeconds: 30,
  });
  return (r.stdout ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [slug, description = "", files = ""] = line.split("\t");
      return { slug, description, files: files.split(",").filter(Boolean) };
    });
}

/** El frontmatter mínimo de una skill: `name` y `description`. Un `: ` sin comillas en el valor
 *  hace que el cargador descarte la skill en silencio (10 de 19 invisibles, medido en gs). */
function validateSkillMarkdown(markdown: string): void {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!m) throw new MachineConfigError("SKILL.md sin frontmatter (--- name / description ---)", 400);
  const fm = m[1];
  for (const key of ["name", "description"]) {
    const line = fm.split(/\r?\n/).find((l) => l.startsWith(`${key}:`));
    if (!line) throw new MachineConfigError(`frontmatter sin \`${key}:\``, 400);
    const value = line.slice(key.length + 1).trim();
    if (!value) throw new MachineConfigError(`\`${key}:\` vacío`, 400);
    const quoted = /^(["']).*\1$/.test(value);
    if (!quoted && value.includes(": ")) {
      throw new MachineConfigError(`\`${key}:\` lleva un ": " sin comillas; entrecomilla el valor o la skill se descarta`, 400);
    }
  }
}

export async function saveAgentSkill(
  ctx: AuthContext,
  agentId: string,
  slug: string,
  markdown: string,
  assets: Array<{ name: string; contentBase64: string }> = []
): Promise<{ slug: string; files: string[]; bytes: number; nota: string }> {
  if (!SKILL_SLUG_RE.test(slug)) throw new MachineConfigError("slug inválido ([a-z0-9-], máx 64)", 400);
  validateSkillMarkdown(markdown);
  const files: Array<{ rel: string; base64: string; bytes: number }> = [
    { rel: "SKILL.md", base64: Buffer.from(markdown, "utf8").toString("base64"), bytes: Buffer.byteLength(markdown, "utf8") },
  ];
  for (const a of assets) {
    const rel = safeRelPath(a.name ?? "");
    if (!rel || rel === "SKILL.md") throw new MachineConfigError(`asset con nombre inválido: ${a.name}`, 400);
    if (typeof a.contentBase64 !== "string") throw new MachineConfigError(`asset ${rel} sin contentBase64`, 400);
    files.push({ rel, base64: a.contentBase64, bytes: Math.floor((a.contentBase64.length * 3) / 4) });
  }
  const total = files.reduce((n, f) => n + f.bytes, 0);
  if (total > MAX_SKILL_BYTES) throw new MachineConfigError("skill demasiado grande (máx 25 MB)", 413);
  const row = await ownedAgentRow(ctx, agentId);
  const dir = `${SKILLS_DIR}/${slug}`;
  const dirs = new Set(files.map((f) => f.rel.includes("/") ? `${dir}/${f.rel.slice(0, f.rel.lastIndexOf("/"))}` : dir));
  await execCommand(ctx, row.sandboxId, {
    command: `rm -rf -- ${shQuote(dir)} && mkdir -p ${[...dirs].map(shQuote).join(" ")}`,
    timeoutSeconds: 15,
  });
  for (const f of files) {
    await writeFile(ctx, row.sandboxId, { path: `${dir}/${f.rel}`, content: f.base64, encoding: "base64" });
  }
  return { slug, files: files.map((f) => f.rel), bytes: total, nota: "el cerebro la ve tras el siguiente reinicio: POST …/restart" };
}

export async function removeAgentSkill(ctx: AuthContext, agentId: string, slug: string): Promise<{ deleted: string; nota: string }> {
  if (!SKILL_SLUG_RE.test(slug)) throw new MachineConfigError("slug inválido", 400);
  const row = await ownedAgentRow(ctx, agentId);
  await execCommand(ctx, row.sandboxId, { command: `rm -rf -- ${shQuote(`${SKILLS_DIR}/${slug}`)}`, timeoutSeconds: 15 });
  return { deleted: slug, nota: "deja de verla tras el siguiente reinicio: POST …/restart" };
}

// ── Reinicio y MCP ────────────────────────────────────────────────────────────────────────

/**
 * Rearranca el unit del agente con su env de creación y rehace el handshake ACP
 * (initialize + session/new con los MCP del dueño). Es lo que hace que skills, MCP y
 * PROMPT.mode entren sin recrear la caja. Guarda los ids de sesión nuevos en la fila.
 * ⚠️ Pierde la conversación en curso: session/new es una sesión nueva.
 */
export async function restartAgentMachine(ctx: AuthContext, agentId: string): Promise<{ reiniciado: true; sandboxId: string }> {
  const row = await ownedAgentRow(ctx, agentId);
  if (!row.spawnEnv) throw new MachineConfigError("este agente es anterior al revive: recréalo", 409);
  const env = JSON.parse(decryptSecret(row.spawnEnv)) as Record<string, string>;
  const template = row.template as SandboxTemplate;
  const tpl = await resolveTemplate(ctx, template);
  const port = row.port ?? tpl.agent?.port ?? 3000;
  const messagePath = row.messagePath ?? tpl.agent?.message_path ?? "/acp";
  const mcpServers = row.acpMcpServers ? (JSON.parse(decryptSecret(row.acpMcpServers)) as AcpMcpServer[]) : [];
  // resume = despierta si dormía; con env reescribe los archivos. Sobre una caja despierta es un no-op.
  await resumeSandbox(ctx, row.sandboxId, { env }).catch(() => {});
  await startAgent(ctx, row.sandboxId, { env, port: tpl.agent?.port, healthPath: tpl.agent?.health_path, unit: tpl.agent?.unit, envFile: tpl.agent?.env_file });
  const handshake = await runAcpHandshake(
    row.sandboxId,
    row.ownerId,
    port,
    messagePath,
    env.ACP_AGENT_TOKEN,
    mcpServers.length ? await expandAcpMcpSecrets(mcpServers, row.ownerId) : []
  );
  await db.agent.update({
    where: { id: row.id },
    data: { status: "running", acpSessionId: handshake.acpSessionId, acpTransportSessionId: handshake.acpTransportSessionId },
  });
  return { reiniciado: true, sandboxId: row.sandboxId };
}

export async function getAgentMcp(ctx: AuthContext, agentId: string): Promise<{ servers: AcpMcpServer[] }> {
  const row = await ownedAgentRow(ctx, agentId);
  return { servers: row.acpMcpServers ? (JSON.parse(decryptSecret(row.acpMcpServers)) as AcpMcpServer[]) : [] };
}

/** Reemplaza la lista entera (como gs) y reinicia para que entre en `session/new`. */
export async function setAgentMcp(
  ctx: AuthContext,
  agentId: string,
  raw: unknown
): Promise<{ servers: AcpMcpServer[]; reiniciado: true }> {
  let servers: AcpMcpServer[];
  try {
    servers = normalizeAcpMcpServers(raw);
  } catch (e) {
    throw new MachineConfigError(e instanceof Error ? e.message : String(e), 400);
  }
  const row = await ownedAgentRow(ctx, agentId);
  await db.agent.update({ where: { id: row.id }, data: { acpMcpServers: servers.length ? encryptSecret(JSON.stringify(servers)) : null } });
  await restartAgentMachine(ctx, agentId);
  return { servers, reiniciado: true };
}

/** Traduce los errores de `ownedAgentRow` y de este módulo a (status, error). */
export function machineErrorResponse(e: unknown): Response {
  if (e instanceof MachineConfigError) return Response.json({ error: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : String(e);
  if (/agent not found/i.test(msg)) return Response.json({ error: "agent not found" }, { status: 404 });
  if (/^agente_sin_maquina/.test(msg)) return Response.json({ error: "agente_sin_maquina", message: msg }, { status: 409 });
  return Response.json({ error: msg }, { status: 502 });
}
