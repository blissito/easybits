// El agente como ARCHIVO — la parte con I/O: leer el estado de la caja, exportarlo, y ejecutar
// el plan de agentSpec.ts. El plan vive AQUÍ (servidor) y no en el CLI a propósito: sólo el
// servidor ve el env de creación y los valores del MCP (cifrados en la fila), así que puede
// comparar y conservar un secreto sin que salga jamás, y el mismo plan sirve al SDK y al MCP.
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import { decryptSecret, encryptSecret } from "../crypto";
import {
  MACHINE_TEMPLATES,
  createAgent,
  execCommand,
  getAgent,
  getAgentPrompt,
  normalizeAcpMcpServers,
  ownedAgentRow,
  shQuote,
  updateAgentPrompt,
  type AcpMcpServer,
  type SandboxTemplate,
} from "./sandboxOperations";
import {
  MachineConfigError,
  SKILLS_DIR,
  WORK_DIR,
  deleteAgentFile,
  putAgentFile,
  removeAgentSkill,
  restartAgentMachine,
  saveAgentSkill,
} from "./agentMachineOperations";
import {
  MANAGED_ENV,
  fillPlaceholders,
  mcpFromSpec,
  planAgentSpec,
  stateToSpec,
  specToYaml,
  type Action,
  type AgentSpec,
  type AgentState,
  type Change,
  type Uploads,
} from "./agentSpec";

// Archivos que genera la plataforma desde el prompt: no son conocimiento.
const GENERATED_FILES = new Set(["CLAUDE.md", ".goosehints", "AGENTS.md"]);

/** sha256 por archivo bajo `dir`, en relativo. Una sola llamada a la caja. */
async function hashTree(ctx: AuthContext, sandboxId: string, dir: string, depth: number): Promise<Record<string, string>> {
  const r = await execCommand(ctx, sandboxId, {
    command: `cd ${shQuote(dir)} 2>/dev/null && find . -maxdepth ${depth} -type f -not -path '*/.*' -exec sha256sum {} + | head -2000`,
    timeoutSeconds: 30,
  });
  const out: Record<string, string> = {};
  for (const line of (r.stdout ?? "").split("\n")) {
    const m = /^([0-9a-f]{64})\s+\.\/(.+)$/.exec(line);
    if (m) out[m[2]] = m[1];
  }
  return out;
}

/** El estado de hoy del agente, con valores reales (nunca sale tal cual: stateToSpec los tapa). */
export async function readAgentState(ctx: AuthContext, agentId: string): Promise<AgentState> {
  requireScope(ctx, "READ");
  const rec = await getAgent(ctx, agentId);
  if (!MACHINE_TEMPLATES.has(rec.template)) {
    return { id: rec.agentId, name: rec.name, template: rec.template, machine: false };
  }
  const row = await ownedAgentRow(ctx, agentId);
  const [prompt, skillTree, fileTree] = await Promise.all([
    getAgentPrompt(ctx, agentId),
    hashTree(ctx, row.sandboxId, SKILLS_DIR, 6),
    hashTree(ctx, row.sandboxId, WORK_DIR, 3),
  ]);
  const skills: Record<string, Record<string, string>> = {};
  for (const [rel, h] of Object.entries(skillTree)) {
    const i = rel.indexOf("/");
    if (i < 1) continue;
    (skills[rel.slice(0, i)] ??= {})[rel.slice(i + 1)] = h;
  }
  for (const slug of Object.keys(skills)) if (!skills[slug]["SKILL.md"]) delete skills[slug];
  const files = Object.fromEntries(Object.entries(fileTree).filter(([p]) => !GENERATED_FILES.has(p)));
  return {
    id: row.id,
    name: row.name,
    template: row.template,
    machine: true,
    prompt: { text: prompt.systemPrompt, mode: prompt.systemPromptMode },
    env: row.spawnEnv ? (JSON.parse(decryptSecret(row.spawnEnv)) as Record<string, string>) : {},
    mcp: row.acpMcpServers ? (JSON.parse(decryptSecret(row.acpMcpServers)) as AcpMcpServer[]) : [],
    skills,
    files,
  };
}

export async function exportAgentSpec(ctx: AuthContext, agentId: string): Promise<{ spec: AgentSpec; yaml: string }> {
  const spec = stateToSpec(await readAgentState(ctx, agentId));
  return { spec, yaml: specToYaml(spec) };
}

export type ApplyResult = {
  agent: string;
  dryRun: boolean;
  plan: Change[];
  applied?: string[];
  failed?: { what: string; error: string };
  /** El archivo de ANTES de aplicar (secretos tapados): el respaldo para volver atrás. */
  before?: string;
};

function describe(a: Action): string {
  switch (a.kind) {
    case "name": return `name ${a.name}`;
    case "prompt": return "prompt";
    case "env": return "env";
    case "mcp": return "mcp";
    case "skill-put": return `skill ${a.slug}`;
    case "skill-rm": return `skill ${a.slug} (remove)`;
    case "file-put": return `file ${a.path}`;
    case "file-rm": return `file ${a.path} (remove)`;
    case "restart": return "restart";
  }
}

async function runAction(ctx: AuthContext, agentId: string, a: Action): Promise<void> {
  switch (a.kind) {
    case "name":
      await db.agent.update({ where: { id: agentId }, data: { name: a.name.slice(0, 64) } });
      return;
    case "prompt":
      await updateAgentPrompt(ctx, agentId, { systemPrompt: a.text, systemPromptMode: a.mode });
      return;
    case "env": {
      // El env de creación (cifrado) es lo que el reinicio vuelve a escribir en la caja. El
      // prompt y lo de la plataforma se toman de la fila de HOY, nunca del plan.
      const row = await ownedAgentRow(ctx, agentId);
      const cur = row.spawnEnv ? (JSON.parse(decryptSecret(row.spawnEnv)) as Record<string, string>) : {};
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(a.env)) if (!MANAGED_ENV.has(k)) next[k] = v;
      for (const [k, v] of Object.entries(cur)) if (MANAGED_ENV.has(k)) next[k] = v;
      await db.agent.update({ where: { id: row.id }, data: { spawnEnv: encryptSecret(JSON.stringify(next)) } });
      return;
    }
    case "mcp": {
      let servers: AcpMcpServer[];
      try {
        servers = normalizeAcpMcpServers(a.servers);
      } catch (e) {
        throw new MachineConfigError(e instanceof Error ? e.message : String(e), 400);
      }
      const row = await ownedAgentRow(ctx, agentId);
      await db.agent.update({ where: { id: row.id }, data: { acpMcpServers: servers.length ? encryptSecret(JSON.stringify(servers)) : null } });
      return;
    }
    case "skill-put":
      await saveAgentSkill(ctx, agentId, a.slug, a.markdown, a.assets);
      return;
    case "skill-rm":
      await removeAgentSkill(ctx, agentId, a.slug);
      return;
    case "file-put":
      await putAgentFile(ctx, agentId, a.path, new Uint8Array(Buffer.from(a.contentBase64, "base64")));
      return;
    case "file-rm":
      await deleteAgentFile(ctx, agentId, a.path);
      return;
    case "restart":
      await restartAgentMachine(ctx, agentId);
      return;
  }
}

/**
 * Plan (dryRun) o plan + ejecución. Se detiene en la primera acción que falla y lo dice: lo
 * anterior queda aplicado (y `before` permite volver). El reinicio va UNA vez, al final.
 */
export async function applyAgentSpec(
  ctx: AuthContext,
  agentId: string,
  spec: AgentSpec,
  opts: { prune?: boolean; dryRun?: boolean; secrets?: Record<string, string>; uploads?: Uploads }
): Promise<ApplyResult> {
  requireScope(ctx, opts.dryRun ? "READ" : "WRITE");
  const cur = await readAgentState(ctx, agentId);
  const plan = planAgentSpec(cur, spec, opts);
  const res: ApplyResult = { agent: agentId, dryRun: !!opts.dryRun, plan: plan.changes };
  if (opts.dryRun || !plan.actions.length) return res;
  res.before = specToYaml(stateToSpec(cur));
  res.applied = [];
  for (const a of plan.actions) {
    try {
      await runAction(ctx, agentId, a);
      res.applied.push(describe(a));
    } catch (e) {
      res.failed = { what: describe(a), error: e instanceof Error ? e.message : String(e) };
      break;
    }
  }
  return res;
}

/**
 * `apply --create`: un agente nuevo con template, nombre, env, MCP y prompt del archivo. Lo que
 * vive en la caja (skills, archivos) entra después con `applyAgentSpec` sobre el nuevo, cuando
 * la máquina ya contesta (el CLI espera por ella).
 */
export async function createFromSpec(
  ctx: AuthContext,
  spec: AgentSpec,
  opts: { secrets?: Record<string, string>; name?: string; dryRun?: boolean; timeoutSeconds?: number }
): Promise<{ dryRun: boolean; plan: Change[]; agentId?: string; sandboxId?: string }> {
  requireScope(ctx, opts.dryRun ? "READ" : "WRITE");
  const plan: Change[] = [];
  const template = spec.template;
  if (!template) throw new MachineConfigError("the file has no template", 400);
  const name = opts.name ?? spec.name ?? undefined;
  const secrets = opts.secrets ?? {};
  const env: Record<string, string> = {};
  const missing: string[] = [];
  for (const [k, raw] of Object.entries(spec.env ?? {})) {
    if (MANAGED_ENV.has(k)) continue;
    const r = fillPlaceholders(String(raw), secrets);
    if (r.missing.length) missing.push(...r.missing);
    else env[k] = r.value;
  }
  if (spec.prompt) env.SYSTEM_PROMPT = spec.prompt;
  if (spec.promptMode) env.SYSTEM_PROMPT_MODE = spec.promptMode;
  const machine = MACHINE_TEMPLATES.has(template);
  let mcpServers: AcpMcpServer[] | undefined;
  if (machine && spec.mcp?.length) {
    const filled = spec.mcp.map((s) => {
      const f = (m?: Record<string, string>) =>
        m && Object.fromEntries(Object.entries(m).map(([k, v]) => {
          const r = fillPlaceholders(String(v), secrets);
          missing.push(...r.missing);
          return [k, r.value];
        }));
      return mcpFromSpec({ ...s, headers: f(s.headers), env: f(s.env) });
    });
    try {
      mcpServers = normalizeAcpMcpServers(filled);
    } catch (e) {
      throw new MachineConfigError(e instanceof Error ? e.message : String(e), 400);
    }
  }
  if (missing.length) {
    throw new MachineConfigError(`missing values for \${${[...new Set(missing)].join("}, ${")}}: export them in your environment (a new agent has nothing to keep)`, 400);
  }
  plan.push({ op: "+", what: `agent ${name ?? "(no name)"} (${template})` });
  if (Object.keys(env).length) plan.push({ op: "+", what: `env: ${Object.keys(env).filter((k) => !k.startsWith("SYSTEM_PROMPT")).join(" ") || "-"}` });
  if (spec.prompt) plan.push({ op: "+", what: `prompt: ${spec.prompt.length} chars${spec.promptMode ? `, mode ${spec.promptMode}` : ""}` });
  for (const s of mcpServers ?? []) plan.push({ op: "+", what: `mcp ${s.name}` });
  if (!machine && (spec.mcp?.length || spec.skills?.length || spec.files?.length)) {
    plan.push({ op: "!", what: `${template} has no machine of its own: mcp, skills and files ignored` });
  }
  if (opts.dryRun) return { dryRun: true, plan };
  const a = await createAgent(ctx, {
    template: template as SandboxTemplate,
    env,
    name,
    timeoutSeconds: opts.timeoutSeconds,
    mcpServers,
  });
  return { dryRun: false, plan, agentId: a.agentId, sandboxId: a.sandboxId };
}

// ── Cuerpo HTTP común de los dos apply ─────────────────────────────────────────────────────

export type ApplyBody = {
  spec: string;
  secrets?: Record<string, string>;
  skills?: Record<string, Array<{ path: string; contentBase64: string }>>;
  files?: Record<string, string>;
  prune?: boolean;
  dryRun?: boolean;
  name?: string;
  timeoutSeconds?: number;
};

const isStrMap = (v: unknown) => v != null && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");

/** Cuerpo común de los dos apply. Un Response = 400 listo para devolver. */
export async function readApplyBody(request: Request): Promise<ApplyBody | Response> {
  const b = (await request.json().catch(() => null)) as Partial<ApplyBody> | null;
  if (!b || typeof b.spec !== "string" || !b.spec.trim()) {
    return Response.json({ error: "invalid_body", message: "spec (the agent file as text) is required" }, { status: 400 });
  }
  if (b.secrets !== undefined && !isStrMap(b.secrets)) return Response.json({ error: "invalid_body", message: "secrets: { NAME: value }" }, { status: 400 });
  if (b.files !== undefined && !isStrMap(b.files)) return Response.json({ error: "invalid_body", message: "files: { path: base64 }" }, { status: 400 });
  if (b.skills !== undefined && (typeof b.skills !== "object" || Array.isArray(b.skills))) {
    return Response.json({ error: "invalid_body", message: "skills: { slug: [{ path, contentBase64 }] }" }, { status: 400 });
  }
  return { ...b, spec: b.spec, prune: b.prune === true, dryRun: b.dryRun === true } as ApplyBody;
}

