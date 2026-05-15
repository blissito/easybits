import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { writeFile as sandboxWriteFile, openAgentMessageStream } from "./sandboxOperations";

// Cap per-file size at 10 MB so a malicious or careless upload can't OOM
// the EasyBits process while we base64 the buffer in memory.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SKILL_TEMPLATES = new Set(["openclaw", "ghostyclaw"]);

// Per-template wire details for the hot-load notification. The Bearer is
// agent.embedToken in both cases — for ghostyclaw that token is also injected
// into the VM as NANOCLAW_ADMIN_TOKEN (see sandboxOperations.ts:707), so the
// admin-api auth() check passes with the same secret.
function resolveRuntimeTarget(template: string, agent: AgentRow): {
  port: number;
  path: string;
} {
  if (template === "ghostyclaw") {
    return { port: 8787, path: "/admin/skills/install" };
  }
  // openclaw + any future template that wires its own /skills/install
  return { port: agent.port ?? 18789, path: "/skills/install" };
}

export interface InstallSkillResult {
  ok: true;
  name: string;
  path: string;
  files: string[];
  bytes: number;
}

interface AgentRow {
  id: string;
  ownerId: string;
  sandboxId: string;
  template: string;
  embedToken: string;
  status: string;
  port: number | null;
}

async function loadAgentRow(ctx: AuthContext, agentId: string): Promise<AgentRow> {
  const row = await db.agent.findUnique({ where: { id: agentId } });
  if (!row || row.ownerId !== ctx.user.id) {
    throw new Error("agent not found");
  }
  if (!SKILL_TEMPLATES.has(row.template)) {
    throw new Error(
      `Skills install unavailable for template "${row.template}" — supported: ${[...SKILL_TEMPLATES].join(", ")}`
    );
  }
  if (row.status !== "running") {
    throw new Error(`agent is ${row.status}; cannot install skill`);
  }
  return row;
}

function slug(name: string): string {
  return name
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function safeAssetName(raw: string): string {
  // Strip any path components — assets land flat under the skill dir.
  const base = raw.split(/[\\/]/).pop() ?? raw;
  if (!base || base === "." || base === "..") {
    throw new Error(`invalid asset filename: ${raw}`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(base)) {
    throw new Error(`asset filename must be [A-Za-z0-9._-]: ${base}`);
  }
  return base;
}

async function notifyRuntime(
  agent: AgentRow,
  body: unknown
): Promise<void> {
  const target = resolveRuntimeTarget(agent.template, agent);
  const { stream } = await openAgentMessageStream(agent.sandboxId, agent.ownerId, {
    port: target.port,
    path: target.path,
    method: "POST",
    headers: {
      Authorization: `Bearer ${agent.embedToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    rawBody: body,
  });
  // Drain so the connection releases — we don't care about the body unless
  // the upstream returned an error shape, but the host already throws on !ok.
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

export interface InstalledSkillEntry {
  name: string;
  description: string;
  files: string[];
  sizeBytes: number;
  uploadedAt: string;
}

// Lee la lista de skills directamente desde la VM (filesystem real). Es la
// fuente de verdad para la UI: refleja cualquier skill que vivió ahí, sin
// importar si pasó por la UI o por API/MCP directa.
export async function listInstalledSkills(
  ctx: AuthContext,
  agentId: string
): Promise<InstalledSkillEntry[]> {
  const agent = await loadAgentRow(ctx, agentId);
  const target = resolveRuntimeTarget(agent.template, agent);
  // El handler GET vive en /admin/skills (ghostyclaw) o /skills (openclaw),
  // siempre el install path sin el /install final.
  const listPath = target.path.replace(/\/install$/, "");
  const { stream } = await openAgentMessageStream(agent.sandboxId, agent.ownerId, {
    port: target.port,
    path: listPath,
    method: "GET",
    headers: {
      Authorization: `Bearer ${agent.embedToken}`,
      Accept: "application/json",
    },
    // sandbox-host exige content o rawBody; un objeto vacío basta — GET ignora body.
    rawBody: {},
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
    const parsed = JSON.parse(text) as { skills?: InstalledSkillEntry[] };
    return parsed.skills ?? [];
  } catch {
    throw new Error(
      `runtime returned non-JSON for GET ${listPath}: ${text.slice(0, 200)}`
    );
  }
}

export async function installSkill(
  ctx: AuthContext,
  agentId: string,
  params: {
    skillFilename: string;
    skillContent: ArrayBuffer;
    assets: Array<{ filename: string; content: ArrayBuffer }>;
  }
): Promise<InstallSkillResult> {
  requireScope(ctx, "WRITE");

  if (params.skillContent.byteLength === 0) {
    throw new Error("skill .md is empty");
  }
  if (params.skillContent.byteLength > MAX_FILE_BYTES) {
    throw new Error(
      `skill .md exceeds per-file limit (${MAX_FILE_BYTES} bytes)`
    );
  }
  let total = params.skillContent.byteLength;
  for (const a of params.assets) {
    if (a.content.byteLength > MAX_FILE_BYTES) {
      throw new Error(
        `asset ${a.filename} exceeds per-file limit (${MAX_FILE_BYTES} bytes)`
      );
    }
    total += a.content.byteLength;
  }
  if (total > MAX_TOTAL_BYTES) {
    throw new Error(
      `total upload exceeds limit (${MAX_TOTAL_BYTES} bytes)`
    );
  }

  const name = slug(params.skillFilename);
  if (!SKILL_NAME_RE.test(name)) {
    throw new Error(
      `cannot derive a valid skill name from "${params.skillFilename}" — slug must match [a-z0-9][a-z0-9-]*`
    );
  }
  const skillDir = `/skills/${name}`;
  const written: string[] = [];

  const agent = await loadAgentRow(ctx, agentId);

  // 1. SKILL.md (the canonical entry point inside the skill directory).
  const skillBase64 = Buffer.from(params.skillContent).toString("base64");
  await sandboxWriteFile(ctx, agent.sandboxId, {
    path: `${skillDir}/SKILL.md`,
    content: skillBase64,
    encoding: "base64",
  });
  written.push("SKILL.md");

  // 2. Assets — flat under the skill directory.
  const seen = new Set<string>(["SKILL.md"]);
  for (const asset of params.assets) {
    const safeName = safeAssetName(asset.filename);
    if (seen.has(safeName)) {
      throw new Error(`duplicate asset filename: ${safeName}`);
    }
    seen.add(safeName);
    const b64 = Buffer.from(asset.content).toString("base64");
    await sandboxWriteFile(ctx, agent.sandboxId, {
      path: `${skillDir}/${safeName}`,
      content: b64,
      encoding: "base64",
    });
    written.push(safeName);
  }

  // 3. Notify the runtime so it picks up the skill without a restart.
  await notifyRuntime(agent, { name, path: skillDir, files: written });

  return { ok: true, name, path: skillDir, files: written, bytes: total };
}
