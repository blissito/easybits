// Configurar un agente CON máquina (ghosty-lite, goose) después de creado: prompt, archivos,
// skills, MCP, reinicio, un turno de prueba, logs, diagnóstico y exportar/clonar.
// Mismo contrato que Ghosty Studio (`ghosty agents …`), portado a los recursos de EasyBits.
// Rutas de la API: /api/v2/agents/:id/{prompt,files,skills,mcp,restart,try} (ver docs «agents»).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { AgentRecord, EasybitsClient } from "@easybits.cloud/sdk";
import type { Ctx, Leaf } from "../types.js";
import { bool, int, need, readStdin, str } from "../args.js";
import { emit, fmtBytes, fmtDate, maskSecret, pickFields, table } from "../output.js";
import { getClient } from "../client.js";
import { api, encodePath } from "../api.js";
import { CliError, EXIT, toCliError, usageError } from "../errors.js";
import { YES_OPTION, confirm, requireYesIfHeadless } from "../prompt.js";
import { t } from "../i18n.js";

export const WORK_DIR = "/data/work";
/** Templates con máquina propia (prompt por archivo, skills, MCP, restart). Espejo de MACHINE_TEMPLATES del servidor. */
export const MACHINE_TEMPLATES = new Set(["ghosty-lite", "goose"]);
export const SKILLS_DIR = "/data/agent/skills";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

type NameValue = { name: string; value: string };
export type McpServer = {
  name: string;
  type?: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: NameValue[];
  headers?: NameValue[];
};
type Prompt = { systemPrompt: string; systemPromptMode: "append" | "replace" };
type SkillEntry = { slug: string; description: string; files: string[] };

const DRY_RUN = { "dry-run": { type: "boolean", description: "Show what would change; change nothing" } } as const;

// ── Lecturas compartidas ──────────────────────────────────────────────────────────────────

const getPrompt = (ctx: Ctx, id: string) => api<Prompt>(ctx, "GET", `/agents/${id}/prompt`);
const getMcp = async (ctx: Ctx, id: string) => (await api<{ servers: McpServer[] }>(ctx, "GET", `/agents/${id}/mcp`)).servers;
const listFiles = (ctx: Ctx, id: string, sub?: string) =>
  api<{ dir: string; files: Array<{ path: string; size: number }> }>(ctx, "GET", `/agents/${id}/files${sub ? `/${encodePath(sub)}` : ""}`);

/** La caja del agente, para leer lo que la API de agentes no expone (contenido de archivos y skills). */
async function agentBox(eb: EasybitsClient, id: string) {
  const a = await eb.getAgent(id);
  return { agent: a, box: await eb.sandboxes.get(a.sandboxId) };
}
type Box = Awaited<ReturnType<typeof agentBox>>["box"];

/** Frontmatter mínimo de SKILL.md; la misma regla que el servidor (un `: ` sin comillas → 400). */
export function skillFrontmatter(md: string): { name?: string; description?: string; error?: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!m) return { error: t("SKILL.md has no frontmatter (--- name / description ---)", "SKILL.md no tiene frontmatter (--- name / description ---)") };
  const out: { name?: string; description?: string; error?: string } = {};
  for (const key of ["name", "description"] as const) {
    const line = m[1].split(/\r?\n/).find((l) => l.startsWith(`${key}:`));
    if (!line) return { ...out, error: t(`frontmatter has no \`${key}:\``, `el frontmatter no tiene \`${key}:\``) };
    const value = line.slice(key.length + 1).trim();
    if (!value) return { ...out, error: t(`\`${key}:\` is empty`, `\`${key}:\` está vacío`) };
    const quoted = /^(["']).*\1$/.test(value);
    if (!quoted && value.includes(": ")) return { ...out, error: t(`\`${key}:\` has an unquoted ": " — quote the value or the skill is dropped`, `\`${key}:\` lleva un ": " sin comillas — entrecomilla el valor o la skill se descarta`) };
    out[key] = quoted ? value.slice(1, -1) : value;
  }
  return out;
}

async function listSkills(box: Box): Promise<SkillEntry[]> {
  let entries;
  try {
    ({ entries } = await box.files.list(SKILLS_DIR));
  } catch {
    return []; // sin carpeta de skills todavía
  }
  const out: SkillEntry[] = [];
  for (const e of entries.filter((x) => x.isDir)) {
    const files = await walk(box, `${SKILLS_DIR}/${e.name}`);
    let description = "";
    if (files.includes("SKILL.md")) {
      const md = (await box.files.read(`${SKILLS_DIR}/${e.name}/SKILL.md`)).content;
      description = skillFrontmatter(md).description ?? "";
    }
    out.push({ slug: e.name, description, files });
  }
  return out;
}

/** Archivos (relativos) bajo `dir` dentro de la caja, recursivo. */
async function walk(box: Box, dir: string, prefix = ""): Promise<string[]> {
  const { entries } = await box.files.list(dir);
  const out: string[] = [];
  for (const e of entries) {
    if (e.isDir) out.push(...(await walk(box, `${dir}/${e.name}`, `${prefix}${e.name}/`)));
    else out.push(`${prefix}${e.name}`);
  }
  return out;
}

/** Una skill entera desde la caja: SKILL.md + assets en base64 (para exportar y clonar). */
async function readSkill(box: Box, s: SkillEntry) {
  const markdown = (await box.files.read(`${SKILLS_DIR}/${s.slug}/SKILL.md`)).content;
  const assets = [];
  for (const rel of s.files.filter((f) => f !== "SKILL.md")) {
    const r = await box.files.read(`${SKILLS_DIR}/${s.slug}/${rel}`, { encoding: "base64" });
    assets.push({ name: rel, contentBase64: r.content });
  }
  return { slug: s.slug, markdown, assets };
}

const maskList = (l?: NameValue[]) => l?.map((x) => ({ name: x.name, value: maskSecret(x.value) }));
export const maskMcp = (servers: McpServer[]) =>
  servers.map((s) => ({ ...s, ...(s.env ? { env: maskList(s.env) } : {}), ...(s.headers ? { headers: maskList(s.headers) } : {}) }));

/** Un paso opcional de `get`/`doctor`: si falla (agente sin máquina, caja perdida) se anota y se sigue. */
async function soft<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: toCliError(e).message };
  }
}

function readLocalText(path: string, usage: string): Promise<string> | string {
  if (path === "-") {
    if (process.stdin.isTTY) throw usageError(t("Expected the content on stdin.", "Se esperaba el contenido por stdin."), usage);
    return readStdin().then((b) => b.toString("utf8"));
  }
  if (!existsSync(path)) throw usageError(t(`File not found: ${path}`, `No existe el archivo: ${path}`), usage);
  return readFileSync(path, "utf8");
}

/** servers.json: un array, o `{ servers }` / `{ mcpServers }` (lo que devuelven get y export). */
export function parseMcpFile(text: string, usage: string): McpServer[] {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch (e) {
    throw usageError(t(`servers file is not JSON: ${(e as Error).message}`, `el archivo de servers no es JSON: ${(e as Error).message}`), usage);
  }
  const list = Array.isArray(j) ? j : (j as any)?.servers ?? (j as any)?.mcpServers;
  if (!Array.isArray(list)) throw usageError(t("Expected an array of MCP servers, or { servers: [...] }.", "Se esperaba un arreglo de servidores MCP, o { servers: [...] }."), usage);
  return list as McpServer[];
}

const hasMasked = (servers: McpServer[]) =>
  servers.some((s) => [...(s.env ?? []), ...(s.headers ?? [])].some((x) => /…\*\*\*$|^\*\*\*$/.test(x.value)));

// ── get ───────────────────────────────────────────────────────────────────────────────────

const GET_FIELDS = [
  "agentId", "name", "template", "status", "lastError", "sandboxId", "agentUrl", "embedToken", "createdAt", "expiresAt",
  "systemPrompt", "systemPromptMode", "mcpServers", "skills", "files",
] as const;
const CONFIG_FIELDS = new Set(["systemPrompt", "systemPromptMode", "mcpServers", "skills", "files"]);

export const get: Leaf = {
  aliases: ["show"],
  summary: "Show one agent: record, prompt, MCP servers, skills and files",
  usage: "easybits agents get <agent> [--fields a,b] [--prompt-out <file>]",
  options: {
    fields: { type: "string", value: "a,b", description: `Only these fields: ${GET_FIELDS.join(", ")}` },
    "prompt-out": { type: "string", value: "file", description: "Write the system prompt to a file instead of printing it" },
  },
  examples: [
    "easybits agents get helper",
    "easybits agents get helper --fields status,systemPromptMode --json",
    "easybits agents get helper --prompt-out PROMPT.md   # edit, then: agents set helper --prompt-file PROMPT.md",
  ],
  async run(ctx) {
    const id = need(ctx, 0, "agent", this.usage);
    const fields = str(ctx, "fields")?.split(",").map((f) => f.trim()).filter(Boolean);
    const bad = fields?.filter((f) => !(GET_FIELDS as readonly string[]).includes(f));
    if (bad?.length) throw usageError(t(`Unknown field(s): ${bad.join(", ")}. Valid: ${GET_FIELDS.join(", ")}`, `Campo(s) desconocido(s): ${bad.join(", ")}. Válidos: ${GET_FIELDS.join(", ")}`), this.usage);
    const promptOut = str(ctx, "prompt-out");
    const want = (f: string) => !fields || fields.includes(f);
    const eb = await getClient(ctx);
    const a = await eb.getAgent(id);
    const rec: Record<string, unknown> = { ...a };
    const notes: string[] = [];
    // Sólo se pide lo que se va a mostrar: cada sección es una llamada (y la de skills entra a la caja).
    // La config de máquina sólo existe con la caja viva y en ghosty-lite/goose: si no, una nota y ya.
    const wantsConfig = ["systemPrompt", "systemPromptMode", "mcpServers", "files", "skills"].some(want) || !!promptOut;
    let machine = wantsConfig && a.status !== "lost";
    if (wantsConfig && !machine) notes.push(t(`its sandbox is lost: prompt, MCP, skills and files are unavailable (easybits agents doctor ${id})`, `su sandbox se perdió: prompt, MCP, skills y archivos no están disponibles (easybits agents doctor ${id})`));
    if (machine) {
      const p = await soft(() => getPrompt(ctx, id));
      if (!p.ok && /agente_sin_maquina|no expone/.test(p.error)) {
        machine = false;
        notes.push(t(`template "${a.template}" has no machine: prompt, MCP, skills and files apply only to ghosty-lite and goose`, `el template "${a.template}" no tiene máquina: prompt, MCP, skills y archivos sólo aplican a ghosty-lite y goose`));
      } else if (p.ok) {
        rec.systemPromptMode = p.value.systemPromptMode;
        if (promptOut) {
          writeFileSync(promptOut, p.value.systemPrompt);
          rec.systemPrompt = { file: resolve(promptOut), bytes: Buffer.byteLength(p.value.systemPrompt) };
        } else rec.systemPrompt = p.value.systemPrompt;
      } else notes.push(`prompt: ${p.error}`);
    }
    if (machine && want("mcpServers")) {
      const m = await soft(() => getMcp(ctx, id));
      if (m.ok) rec.mcpServers = maskMcp(m.value);
      else notes.push(`mcp: ${m.error}`);
    }
    if (machine && want("files")) {
      const f = await soft(() => listFiles(ctx, id));
      if (f.ok) rec.files = f.value.files;
      else notes.push(`files: ${f.error}`);
    }
    if (machine && want("skills")) {
      const s = await soft(async () => listSkills((await agentBox(eb, id)).box));
      if (s.ok) rec.skills = s.value;
      else notes.push(`skills: ${s.error}`);
    }
    const errors = notes;
    const out: Record<string, unknown> = { ...pickFields(rec, fields), ...(errors.length ? { errors } : {}) };
    emit(ctx, out, () => {
      if (fields) {
        for (const f of fields) console.log(`${f}: ${typeof out[f] === "object" ? JSON.stringify(out[f]) : out[f] ?? "-"}`);
        return;
      }
      printAgent(a);
      if (rec.systemPromptMode) console.log(`Prompt:    ${rec.systemPromptMode}${promptOut ? ` → ${resolve(promptOut)}` : ""}`);
      const mcp = rec.mcpServers as McpServer[] | undefined;
      if (mcp) console.log(`MCP:       ${mcp.length ? mcp.map((s) => s.name).join(", ") : t("none", "ninguno")}`);
      const skills = rec.skills as SkillEntry[] | undefined;
      if (skills) console.log(`Skills:    ${skills.length ? skills.map((s) => s.slug).join(", ") : t("none", "ninguna")}`);
      const files = rec.files as Array<{ path: string }> | undefined;
      if (files) console.log(`${t("Files:    ", "Archivos: ")} ${files.length} ${t("in", "en")} ${WORK_DIR}`);
      for (const e of errors) console.error(`${t("note", "nota")}: ${e}`);
      if (typeof rec.systemPrompt === "string" && rec.systemPrompt) console.log(`\n${rec.systemPrompt.trimEnd()}`);
    });
  },
};

/** Por qué falló el último arranque (el servidor lo manda con status "error"; SDK ≥ 0.36.3). */
export const startError = (a: AgentRecord): string | null =>
  a.status === "error" ? ((a as AgentRecord & { lastError?: string | null }).lastError ?? null) : null;

export function printAgent(a: AgentRecord) {
  console.log(`ID:        ${a.agentId}`);
  if (a.name) console.log(`${t("Name:     ", "Nombre:   ")} ${a.name}`);
  console.log(`Template:  ${a.template}`);
  console.log(`${t("Status:   ", "Estado:   ")} ${a.status}`);
  const reason = startError(a);
  if (reason) console.log(`Error:     ${reason}`);
  console.log(`Sandbox:   ${a.sandboxId}`);
  console.log(`URL:       ${a.agentUrl}`);
  console.log(`Token:     ${maskSecret(a.embedToken ?? "")}   (full value: --fields embedToken --json)`);
  console.log(`${t("Created:  ", "Creado:   ")} ${fmtDate(a.createdAt)}`);
  console.log(`${t("Expires:  ", "Vence:    ")} ${a.expiresAt ? fmtDate(a.expiresAt) : t("never", "nunca")}`);
}

// ── set ───────────────────────────────────────────────────────────────────────────────────

export const set: Leaf = {
  summary: "Change the system prompt (ghosty-lite, goose); takes effect without a reboot",
  usage: "easybits agents set <agent> [--prompt <text> | --prompt-file <file|->] [--prompt-mode append|replace] [--dry-run]",
  options: {
    prompt: { type: "string", value: "text", description: "New system prompt" },
    "prompt-file": { type: "string", value: "file", description: "Read the prompt from a file (- = stdin)" },
    "prompt-mode": { type: "string", value: "mode", description: "append (to the engine's own) or replace it" },
    ...DRY_RUN,
  },
  examples: [
    "easybits agents set helper --prompt-file PROMPT.md --dry-run",
    "easybits agents set helper --prompt-file PROMPT.md --prompt-mode replace",
    "cat PROMPT.md | easybits agents set helper --prompt-file - --json",
  ],
  async run(ctx) {
    const id = need(ctx, 0, "agent", this.usage);
    const inline = str(ctx, "prompt");
    const file = str(ctx, "prompt-file");
    if (inline != null && file) throw usageError(t("Use --prompt or --prompt-file, not both.", "Usa --prompt o --prompt-file, no los dos."), this.usage);
    const mode = str(ctx, "prompt-mode");
    if (mode && mode !== "append" && mode !== "replace") throw usageError(t("--prompt-mode must be append or replace.", "--prompt-mode debe ser append o replace."), this.usage);
    const prompt = inline ?? (file ? await readLocalText(file, this.usage) : undefined);
    if (prompt == null && !mode) throw usageError(t("Nothing to change: pass --prompt, --prompt-file or --prompt-mode.", "Nada que cambiar: pasa --prompt, --prompt-file o --prompt-mode."), this.usage);
    const cur = await getPrompt(ctx, id);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (prompt != null && prompt !== cur.systemPrompt) {
      changes.systemPrompt = { from: `${Buffer.byteLength(cur.systemPrompt)} bytes`, to: `${Buffer.byteLength(prompt)} bytes` };
    }
    if (mode && mode !== cur.systemPromptMode) changes.systemPromptMode = { from: cur.systemPromptMode, to: mode };
    if (bool(ctx, "dry-run") || !Object.keys(changes).length) {
      const dry = { agentId: id, dryRun: bool(ctx, "dry-run"), changes };
      emit(ctx, dry, () => {
        if (!Object.keys(changes).length) return console.log(t("No changes: the agent already has that prompt.", "Sin cambios: el agente ya tiene ese prompt."));
        for (const [k, v] of Object.entries(changes)) console.log(`${k}: ${v.from} → ${v.to}`);
        console.log(t("(dry run: nothing changed)", "(simulación: no cambió nada)"));
      });
      return;
    }
    const r = await api<{ ok: true; systemPromptMode: string; hooks: string }>(ctx, "PATCH", `/agents/${id}`, {
      ...(changes.systemPrompt ? { systemPrompt: prompt } : {}),
      ...(changes.systemPromptMode ? { systemPromptMode: mode } : {}),
    });
    emit(ctx, { agentId: id, changes, ...r }, () => {
      for (const [k, v] of Object.entries(changes)) console.log(`${k}: ${v.from} → ${v.to}`);
      if (r.hooks) console.log(r.hooks);
      console.log(t(`Check it: easybits agents try ${id} "who are you?"`, `Revísalo: easybits agents try ${id} "¿quién eres?"`));
    });
  },
};

// ── files ─────────────────────────────────────────────────────────────────────────────────

const FILES_USAGE = "easybits agents files <ls|get|put|rm> <agent> [path|local-file...]";

export const files: Leaf = {
  summary: `Knowledge files in ${WORK_DIR}: list, read, upload (several at once) or delete`,
  usage: FILES_USAGE,
  options: {
    out: { type: "string", value: "file", description: "get: save to a local file (binary-safe)" },
    to: { type: "string", value: "dir", description: `put: folder inside ${WORK_DIR} (default: its root)` },
    ...DRY_RUN,
    ...YES_OPTION,
  },
  examples: [
    "easybits agents files ls helper",
    "easybits agents files put helper catalog.pdf prices.csv --to docs",
    "easybits agents files get helper docs/prices.csv --out prices.csv",
    "easybits agents files rm helper docs/old.pdf docs/old2.pdf --yes",
  ],
  async run(ctx) {
    const action = need(ctx, 0, "ls|get|put|rm", FILES_USAGE);
    const id = need(ctx, 1, "agent", FILES_USAGE);
    const rest = ctx.args.slice(2);
    if (action === "ls" || action === "list") {
      const r = await listFiles(ctx, id, rest[0]);
      emit(ctx, r, () =>
        table(r.files.map((f) => ({ ...f, size: fmtBytes(f.size) })), [["path", "PATH"], ["size", "SIZE"]], t(`No files in ${r.dir}. Upload: easybits agents files put ${id} <file>`, `No hay archivos en ${r.dir}. Sube: easybits agents files put ${id} <archivo>`)),
      );
    } else if (action === "get" || action === "read" || action === "cat") {
      const path = need(ctx, 2, "path", FILES_USAGE);
      const eb = await getClient(ctx);
      const { box } = await agentBox(eb, id);
      const full = `${WORK_DIR}/${path.replace(/^\/+/, "")}`;
      const out = str(ctx, "out");
      if (out) {
        const r = await box.files.read(full, { encoding: "base64" });
        writeFileSync(out, Buffer.from(r.content, "base64"));
        emit(ctx, { path, out: resolve(out), size: r.size }, () => console.error(t(`Saved ${fmtBytes(r.size)} to ${resolve(out)}`, `Guardé ${fmtBytes(r.size)} en ${resolve(out)}`)));
      } else {
        const r = await box.files.read(full);
        emit(ctx, r, () => process.stdout.write(r.content));
      }
    } else if (action === "put" || action === "upload") {
      if (!rest.length) throw usageError(t("Give one or more local files.", "Pasa uno o más archivos locales."), FILES_USAGE);
      const to = (str(ctx, "to") ?? "").replace(/^\/+|\/+$/g, "");
      const plan = rest.map((local) => {
        if (!existsSync(local) || !statSync(local).isFile()) throw usageError(t(`File not found: ${local}`, `No existe el archivo: ${local}`), FILES_USAGE);
        return { local, path: to ? `${to}/${basename(local)}` : basename(local), bytes: statSync(local).size };
      });
      if (bool(ctx, "dry-run")) {
        emit(ctx, { agentId: id, dryRun: true, upload: plan }, () => {
          for (const p of plan) console.log(`${p.local} → ${WORK_DIR}/${p.path} (${fmtBytes(p.bytes)})`);
          console.log(t("(dry run: nothing uploaded)", "(simulación: no se subió nada)"));
        });
        return;
      }
      const done: Array<{ local: string; path: string; bytes: number }> = [];
      for (const p of plan) {
        const r = await api<{ path: string; bytes: number }>(ctx, "PUT", `/agents/${id}/files/${encodePath(p.path)}`, readFileSync(p.local), { raw: true });
        done.push({ local: p.local, ...r });
        if (!ctx.json) console.log(`${t("Uploaded", "Subido")} ${p.local} → ${WORK_DIR}/${p.path} (${fmtBytes(p.bytes)})`);
      }
      if (ctx.json) emit(ctx, done, () => {});
    } else if (action === "rm" || action === "delete") {
      if (!rest.length) throw usageError(t("Give one or more paths.", "Pasa una o más rutas."), FILES_USAGE);
      if (bool(ctx, "dry-run")) {
        emit(ctx, { agentId: id, dryRun: true, delete: rest }, () => {
          for (const p of rest) console.log(`${t("would delete", "borraría")} ${WORK_DIR}/${p}`);
        });
        return;
      }
      requireYesIfHeadless(ctx);
      await confirm(ctx, t(`Delete ${rest.length === 1 ? rest[0] : `${rest.length} files`} from agent ${id}?`, `¿Borrar ${rest.length === 1 ? rest[0] : `${rest.length} archivos`} del agente ${id}?`));
      const done: Array<{ deleted: string }> = [];
      for (const p of rest) done.push(await api<{ deleted: string }>(ctx, "DELETE", `/agents/${id}/files/${encodePath(p)}`));
      emit(ctx, done, () => done.forEach((d) => console.log(`${t("Deleted", "Borrado")} ${d.deleted}`)));
    } else throw usageError(t(`Unknown files action "${action}".`, `Acción de files desconocida "${action}".`), FILES_USAGE);
  },
};

// ── skills ────────────────────────────────────────────────────────────────────────────────

const SKILLS_USAGE = "easybits agents skills <ls|get|add|rm> <agent> [slug...] [--file SKILL.md | --dir <folder>] [--restart]";

/** Una carpeta local → SKILL.md + assets (base64), sin dotfiles ni node_modules. */
function readSkillDir(dir: string) {
  const assets: Array<{ name: string; contentBase64: string }> = [];
  const visit = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) visit(p);
      else if (e.isFile() && relative(dir, p) !== "SKILL.md") assets.push({ name: relative(dir, p).split("\\").join("/"), contentBase64: readFileSync(p).toString("base64") });
    }
  };
  visit(dir);
  return assets;
}

async function restartAgent(ctx: Ctx, id: string) {
  return api<{ reiniciado: true; sandboxId: string }>(ctx, "POST", `/agents/${id}/restart`);
}

export const skills: Leaf = {
  summary: "Skills in /data/agent/skills: list, read, add from a file or folder, remove",
  usage: SKILLS_USAGE,
  options: {
    file: { type: "string", value: "SKILL.md", description: "add: a single SKILL.md" },
    dir: { type: "string", value: "folder", description: "add: a folder with SKILL.md and its assets" },
    slug: { type: "string", value: "slug", description: "add: slug (default: the frontmatter name, else the folder)" },
    out: { type: "string", value: "dir", description: "get: download the whole skill into this folder" },
    restart: { type: "boolean", description: "add/rm: restart the agent so it sees the change (new session)" },
    ...DRY_RUN,
    ...YES_OPTION,
  },
  examples: [
    "easybits agents skills ls helper",
    "easybits agents skills add helper --dir ./skills/quotes --restart",
    "easybits agents skills add helper --file SKILL.md --dry-run",
    "easybits agents skills get helper quotes --out ./quotes",
    "easybits agents skills rm helper quotes --yes --restart",
  ],
  async run(ctx) {
    const action = need(ctx, 0, "ls|get|add|rm", SKILLS_USAGE);
    const id = need(ctx, 1, "agent", SKILLS_USAGE);
    if (action === "ls" || action === "list") {
      const eb = await getClient(ctx);
      const list = await listSkills((await agentBox(eb, id)).box);
      emit(ctx, list, () =>
        table(list.map((s) => ({ ...s, files: s.files.length })), [["slug", "SLUG"], ["files", "FILES"], ["description", "DESCRIPTION"]], t(`No skills. Add one: easybits agents skills add ${id} --dir <folder>`, `No hay skills. Agrega una: easybits agents skills add ${id} --dir <carpeta>`)),
      );
    } else if (action === "get" || action === "read") {
      const slug = need(ctx, 2, "slug", SKILLS_USAGE);
      const eb = await getClient(ctx);
      const { box } = await agentBox(eb, id);
      const entry = (await listSkills(box)).find((s) => s.slug === slug);
      if (!entry) throw new CliError(t(`No skill "${slug}" on agent ${id}.`, `El agente ${id} no tiene la skill "${slug}".`), EXIT.API, t(`List them: easybits agents skills ls ${id}`, `Enlístalas: easybits agents skills ls ${id}`), "not_found", 404);
      const out = str(ctx, "out");
      if (!out) {
        const md = (await box.files.read(`${SKILLS_DIR}/${slug}/SKILL.md`)).content;
        emit(ctx, { ...entry, markdown: md }, () => process.stdout.write(md.endsWith("\n") ? md : md + "\n"));
        return;
      }
      const s = await readSkill(box, entry);
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, "SKILL.md"), s.markdown);
      for (const a of s.assets) {
        mkdirSync(dirname(join(out, a.name)), { recursive: true });
        writeFileSync(join(out, a.name), Buffer.from(a.contentBase64, "base64"));
      }
      emit(ctx, { slug, out: resolve(out), files: entry.files }, () => console.log(t(`Saved ${entry.files.length} file(s) to ${resolve(out)}`, `Guardé ${entry.files.length} archivo(s) en ${resolve(out)}`)));
    } else if (action === "add" || action === "put") {
      const file = str(ctx, "file");
      const dir = str(ctx, "dir");
      if (!!file === !!dir) throw usageError(t("Pass --file SKILL.md or --dir <folder>.", "Pasa --file SKILL.md o --dir <carpeta>."), SKILLS_USAGE);
      const mdPath = file ?? join(dir!, "SKILL.md");
      if (!existsSync(mdPath)) throw usageError(t(`File not found: ${mdPath}`, `No existe el archivo: ${mdPath}`), SKILLS_USAGE);
      const markdown = readFileSync(mdPath, "utf8");
      const fm = skillFrontmatter(markdown);
      if (fm.error) throw usageError(`${mdPath}: ${fm.error}`, SKILLS_USAGE);
      const slug = str(ctx, "slug") ?? (fm.name && SLUG_RE.test(fm.name) ? fm.name : basename(resolve(dir ?? dirname(mdPath))).toLowerCase());
      if (!SLUG_RE.test(slug)) throw usageError(t(`Invalid slug "${slug}" ([a-z0-9-], max 64). Pass --slug.`, `Slug inválido "${slug}" ([a-z0-9-], máx 64). Pasa --slug.`), SKILLS_USAGE);
      const assets = dir ? readSkillDir(dir) : [];
      const plan = { agentId: id, slug, files: ["SKILL.md", ...assets.map((a) => a.name)], restart: bool(ctx, "restart") };
      if (bool(ctx, "dry-run")) {
        emit(ctx, { ...plan, dryRun: true }, () => console.log(t(`would add skill ${slug} (${plan.files.length} file(s))${plan.restart ? " and restart" : ""}\n(dry run: nothing changed)`, `agregaría la skill ${slug} (${plan.files.length} archivo(s))${plan.restart ? " y reiniciaría" : ""}\n(simulación: no cambió nada)`)));
        return;
      }
      const r = await api<{ slug: string; files: string[]; bytes: number }>(ctx, "PUT", `/agents/${id}/skills/${slug}`, { markdown, assets });
      const restarted = plan.restart ? await restartAgent(ctx, id) : null;
      emit(ctx, { ...r, restarted: !!restarted }, () => {
        console.log(t(`Added skill ${slug} (${r.files.length} file(s), ${fmtBytes(r.bytes)})`, `Skill ${slug} agregada (${r.files.length} archivo(s), ${fmtBytes(r.bytes)})`));
        console.log(restarted ? t("Restarted: the agent sees it now.", "Reiniciado: el agente ya la ve.") : t(`It takes effect after: easybits agents restart ${id}`, `Entra después de: easybits agents restart ${id}`));
      });
    } else if (action === "rm" || action === "delete") {
      const slugs = ctx.args.slice(2);
      if (!slugs.length) throw usageError(t("Give one or more slugs.", "Pasa uno o más slugs."), SKILLS_USAGE);
      if (bool(ctx, "dry-run")) {
        emit(ctx, { agentId: id, dryRun: true, delete: slugs }, () => slugs.forEach((s) => console.log(`${t("would remove skill", "quitaría la skill")} ${s}`)));
        return;
      }
      requireYesIfHeadless(ctx);
      await confirm(ctx, t(`Remove skill${slugs.length > 1 ? "s" : ""} ${slugs.join(", ")} from agent ${id}?`, `¿Quitar la(s) skill(s) ${slugs.join(", ")} del agente ${id}?`));
      const done: Array<{ deleted: string }> = [];
      for (const s of slugs) done.push(await api<{ deleted: string }>(ctx, "DELETE", `/agents/${id}/skills/${s}`));
      const restarted = bool(ctx, "restart") ? await restartAgent(ctx, id) : null;
      emit(ctx, { deleted: done.map((d) => d.deleted), restarted: !!restarted }, () => {
        done.forEach((d) => console.log(`${t("Removed", "Quitada")} ${d.deleted}`));
        console.log(restarted ? t("Restarted.", "Reiniciado.") : t(`It takes effect after: easybits agents restart ${id}`, `Entra después de: easybits agents restart ${id}`));
      });
    } else throw usageError(t(`Unknown skills action "${action}".`, `Acción de skills desconocida "${action}".`), SKILLS_USAGE);
  },
};

// ── mcp ───────────────────────────────────────────────────────────────────────────────────

const MCP_USAGE = "easybits agents mcp <get|set> <agent> [--file <servers.json|->] [--dry-run]";

export const mcp: Leaf = {
  summary: "The agent's own MCP servers: show them, or replace the whole list (restarts it)",
  usage: MCP_USAGE,
  options: {
    file: { type: "string", value: "servers.json", description: "set: JSON array (or { servers }); - = stdin. [] removes all" },
    "show-secrets": { type: "boolean", description: "get: print env/header values unmasked" },
    ...DRY_RUN,
  },
  examples: [
    "easybits agents mcp get helper",
    "easybits agents mcp get helper --json --show-secrets > servers.json",
    "easybits agents mcp set helper --file servers.json --dry-run",
    `echo '[{"name":"crm","type":"http","url":"https://crm.example.com/mcp","headers":[{"name":"Authorization","value":"$secret:CRM_TOKEN"}]}]' | easybits agents mcp set helper --file -`,
  ],
  async run(ctx) {
    const action = need(ctx, 0, "get|set", MCP_USAGE);
    const id = need(ctx, 1, "agent", MCP_USAGE);
    if (action === "get" || action === "ls") {
      const servers = await getMcp(ctx, id);
      const shown = bool(ctx, "show-secrets") ? servers : maskMcp(servers);
      emit(ctx, { servers: shown }, () =>
        table(shown.map((s) => ({ name: s.name, type: s.type ?? "stdio", target: s.url ?? [s.command, ...(s.args ?? [])].join(" ") })), [["name", "NAME"], ["type", "TYPE"], ["target", "URL / COMMAND"]], t("No MCP servers.", "Sin servidores MCP.")),
      );
      return;
    }
    if (action !== "set") throw usageError(t(`Unknown mcp action "${action}".`, `Acción de mcp desconocida "${action}".`), MCP_USAGE);
    const file = str(ctx, "file");
    if (!file) throw usageError(t("Missing --file.", "Falta --file."), MCP_USAGE);
    const next = parseMcpFile(await readLocalText(file, MCP_USAGE), MCP_USAGE);
    if (hasMasked(next)) throw usageError(t("The file has masked values (…***). Export with --show-secrets or use $secret:NAME references.", "El archivo trae valores tapados (…***). Exporta con --show-secrets o usa referencias $secret:NOMBRE."), MCP_USAGE);
    const cur = await getMcp(ctx, id);
    const names = (l: McpServer[]) => new Set(l.map((s) => s.name));
    const diff = {
      added: [...names(next)].filter((n) => !names(cur).has(n)),
      removed: [...names(cur)].filter((n) => !names(next).has(n)),
      changed: next.filter((s) => { const c = cur.find((x) => x.name === s.name); return c && JSON.stringify(c) !== JSON.stringify(s); }).map((s) => s.name),
    };
    if (bool(ctx, "dry-run")) {
      emit(ctx, { agentId: id, dryRun: true, ...diff, servers: maskMcp(next) }, () => {
        console.log(`added: ${diff.added.join(", ") || "-"}\nremoved: ${diff.removed.join(", ") || "-"}\nchanged: ${diff.changed.join(", ") || "-"}`);
        console.log(t("(dry run: nothing changed; a real set restarts the agent)", "(simulación: no cambió nada; un set de verdad reinicia el agente)"));
      });
      return;
    }
    const r = await api<{ servers: McpServer[] }>(ctx, "PUT", `/agents/${id}/mcp`, { servers: next });
    emit(ctx, { agentId: id, ...diff, servers: maskMcp(r.servers), restarted: true }, () =>
      console.log(t(`MCP servers: ${r.servers.map((s) => s.name).join(", ") || "none"} (agent restarted, new session)`, `Servidores MCP: ${r.servers.map((s) => s.name).join(", ") || "ninguno"} (agente reiniciado, sesión nueva)`)),
    );
  },
};

// ── restart, try, logs ────────────────────────────────────────────────────────────────────

export const restart: Leaf = {
  summary: "Restart the agent (picks up skills, MCP and prompt mode; starts a new session)",
  usage: "easybits agents restart <agent>",
  examples: ["easybits agents restart helper"],
  async run(ctx) {
    const id = need(ctx, 0, "agent", this.usage);
    const r = await restartAgent(ctx, id);
    emit(ctx, { agentId: id, restarted: true, sandboxId: r.sandboxId }, () => console.log(t(`Restarted ${id}`, `Reiniciado ${id}`)));
  },
};

export const tryTurn: Leaf = {
  summary: "One full turn as text (no stream): verify what you just configured",
  usage: "easybits agents try <agent> <text...> [--session <id>] [--reset]",
  options: {
    session: { type: "string", value: "id", description: "Continue this session (printed after each turn)" },
    reset: { type: "boolean", description: "Start a fresh session" },
  },
  examples: ['easybits agents try helper "who are you and which skills do you have?"', 'easybits agents try helper "and the price?" --session s_123 --json'],
  async run(ctx) {
    const id = need(ctx, 0, "agent", this.usage);
    const text = ctx.args.slice(1).join(" ");
    if (!text) throw usageError(t("Missing <text>.", "Falta <text>."), this.usage);
    let r: { text: string; error: string | null; session: string | null; ms: number };
    try {
      r = await api(ctx, "POST", `/agents/${id}/try`, { text, session: str(ctx, "session"), reset: bool(ctx, "reset") });
    } catch (e) {
      // 502 = el agente terminó sin texto: el cuerpo trae el error y la sesión, no se tira.
      const err = toCliError(e);
      if (err.status === 409) err.hint = t("A turn is already running in that session. Wait, or use another --session.", "Ya hay un turno corriendo en esa sesión. Espera, o usa otra --session.");
      throw err;
    }
    emit(ctx, r, () => {
      console.log(r.text || t("(no text)", "(sin texto)"));
      if (r.error) console.error(`error: ${r.error}`);
      console.error(r.session ? `${t("session", "sesión")}: ${r.session} · ${(r.ms / 1000).toFixed(1)}s   (${t("continue", "para seguir")}: --session ${r.session})` : `${(r.ms / 1000).toFixed(1)}s`);
    });
  },
};

export const logs: Leaf = {
  summary: "Read the journal of the agent's sandbox",
  usage: "easybits agents logs <agent> [--unit <unit>] [--lines <n>] [--since <spec>] [--grep <text>]",
  options: {
    unit: { type: "string", value: "unit", description: "systemd unit to filter" },
    lines: { type: "string", value: "n", description: "Last N lines (default 200)" },
    since: { type: "string", value: "spec", description: 'journalctl time spec, e.g. "10 min ago"' },
    grep: { type: "string", value: "text", description: "Only lines matching" },
  },
  examples: ["easybits agents logs helper --lines 50", "easybits agents logs helper --since '10 min ago' --grep error"],
  async run(ctx) {
    const id = need(ctx, 0, "agent", this.usage);
    const eb = await getClient(ctx);
    const { box } = await agentBox(eb, id);
    const r = await box.logs({ unit: str(ctx, "unit"), lines: int(ctx, "lines", this.usage), since: str(ctx, "since"), grep: str(ctx, "grep") });
    emit(ctx, r, () => process.stdout.write(r.output.endsWith("\n") || !r.output ? r.output : r.output + "\n"));
  },
};

// ── doctor ────────────────────────────────────────────────────────────────────────────────

type Check = { check: string; ok: boolean; detail: string; hint?: string };

export const doctor: Leaf = {
  summary: "Check an agent: status, sandbox, prompt, skills frontmatter, MCP; exits 1 on a problem",
  usage: "easybits agents doctor <agent>",
  examples: ["easybits agents doctor helper", "easybits agents doctor helper --json | jq '.checks[] | select(.ok==false)'"],
  async run(ctx) {
    const id = need(ctx, 0, "agent", this.usage);
    const eb = await getClient(ctx);
    const a = await eb.getAgent(id);
    const checks: Check[] = [];
    const add = (c: Check) => checks.push(c);
    add({
      check: "status",
      ok: a.status === "running" || a.status === "suspended",
      detail: startError(a) ? `error: ${startError(a)}` : a.status,
      ...(a.status === "error" ? { hint: t(`Its runtime did not start. Fix the cause, then: easybits agents restart ${id}`, `Su runtime no arrancó. Corrige la causa y luego: easybits agents restart ${id}`) } : {}),
      ...(a.status === "lost" ? { hint: t(`Its sandbox is gone. Destroy it (easybits agents destroy ${id}) or recreate it (easybits agents create --from <export.json>).`, `Su sandbox ya no existe. Destrúyelo (easybits agents destroy ${id}) o recréalo (easybits apply <archivo> --create).`) } : {}),
    });
    if (a.expiresAt) {
      const left = new Date(a.expiresAt).getTime() - Date.now();
      add({ check: "expires", ok: left > 0, detail: left > 0 ? t(`in ${Math.round(left / 60000)} min`, `en ${Math.round(left / 60000)} min`) : t(`expired ${fmtDate(a.expiresAt)}`, `venció ${fmtDate(a.expiresAt)}`) });
    }
    const sb = await soft(() => eb.sandboxes.get(a.sandboxId));
    add(sb.ok ? { check: "sandbox", ok: sb.value.status !== "error", detail: `${a.sandboxId} ${sb.value.status}` } : { check: "sandbox", ok: false, detail: sb.error });
    if (sb.ok && sb.value.status === "running") {
      const p = await soft(() => getPrompt(ctx, id));
      if (!p.ok && /agente_sin_maquina|no expone/.test(p.error)) {
        add({ check: "machine", ok: true, detail: t(`template ${a.template} has no machine config (prompt/skills/MCP): nothing more to check`, `el template ${a.template} no tiene config de máquina (prompt/skills/MCP): nada más que revisar`) });
      } else {
        add(p.ok ? { check: "prompt", ok: p.value.systemPrompt.trim().length > 0, detail: `${Buffer.byteLength(p.value.systemPrompt)} bytes, ${p.value.systemPromptMode}`, ...(p.value.systemPrompt.trim() ? {} : { hint: t(`Set one: easybits agents set ${id} --prompt-file PROMPT.md`, `Ponle uno: easybits agents set ${id} --prompt-file PROMPT.md`) }) } : { check: "prompt", ok: false, detail: p.error });
        const s = await soft(() => listSkills(sb.value));
        if (s.ok) {
          add({ check: "skills", ok: true, detail: s.value.length ? s.value.map((x) => x.slug).join(", ") : "none" });
          for (const skill of s.value) {
            const md = await soft(() => sb.value.files.read(`${SKILLS_DIR}/${skill.slug}/SKILL.md`));
            const fm = md.ok ? skillFrontmatter(md.value.content) : { error: "no SKILL.md" };
            if (fm.error) add({ check: `skill ${skill.slug}`, ok: false, detail: fm.error, hint: t("The engine drops this skill silently. Fix SKILL.md and add it again.", "El motor descarta esta skill en silencio. Corrige SKILL.md y vuelve a agregarla.") });
          }
        } else add({ check: "skills", ok: false, detail: s.error });
        const m = await soft(() => getMcp(ctx, id));
        add(m.ok ? { check: "mcp", ok: true, detail: m.value.length ? m.value.map((x) => x.name).join(", ") : "none" } : { check: "mcp", ok: false, detail: m.error });
      }
    }
    const ok = checks.every((c) => c.ok);
    emit(ctx, { agentId: id, ok, checks }, () => {
      for (const c of checks) {
        console.log(`${c.ok ? "ok  " : t("FAIL", "MAL ")}  ${c.check.padEnd(14)} ${c.detail}`);
        if (!c.ok && c.hint) console.log(`      ${"".padEnd(14)} → ${c.hint}`);
      }
      console.log(ok ? t("\nNo problems found.", "\nSin problemas.") : t("\nProblems found.", "\nHay problemas."));
    });
    if (!ok) process.exitCode = EXIT.API;
  },
};

// ── export y clonar ───────────────────────────────────────────────────────────────────────

export type AgentExport = {
  kind: "easybits.agent";
  version: 1;
  source: { agentId: string; exportedAt: string };
  template: string;
  name: string | null;
  systemPrompt?: string;
  systemPromptMode?: "append" | "replace";
  mcpServers?: McpServer[];
  skills?: Array<{ slug: string; markdown: string; assets: Array<{ name: string; contentBase64: string }> }>;
  files?: Array<{ path: string; size: number; contentBase64?: string }>;
};

/** Lee la config completa de un agente. Nunca el env (secretos del proveedor): eso lo pone quien clona. */
export async function buildExport(ctx: Ctx, id: string, opts: { secrets: boolean; fileContents: boolean }): Promise<AgentExport> {
  const eb = await getClient(ctx);
  const { agent, box } = await agentBox(eb, id);
  const out: AgentExport = {
    kind: "easybits.agent",
    version: 1,
    source: { agentId: agent.agentId, exportedAt: new Date().toISOString() },
    template: agent.template,
    name: agent.name,
  };
  const p = await soft(() => getPrompt(ctx, id));
  if (!p.ok) {
    if (/agente_sin_maquina|no expone/.test(p.error)) return out; // sin máquina: sólo template y nombre
    throw new CliError(t(`Could not read the agent's config: ${p.error}`, `No se pudo leer la config del agente: ${p.error}`), EXIT.API, t(`Is it running? easybits agents doctor ${id}`, `¿Está corriendo? easybits agents doctor ${id}`));
  }
  out.systemPrompt = p.value.systemPrompt;
  out.systemPromptMode = p.value.systemPromptMode;
  const servers = await getMcp(ctx, id);
  out.mcpServers = opts.secrets ? servers : maskMcp(servers);
  out.skills = [];
  for (const s of await listSkills(box)) out.skills.push(await readSkill(box, s));
  const { files } = await listFiles(ctx, id);
  out.files = [];
  // /data/work/CLAUDE.md lo genera ghosty-prompt-hooks desde el prompt: no es conocimiento.
  for (const f of files.filter((x) => x.path !== "CLAUDE.md")) {
    out.files.push(opts.fileContents ? { ...f, contentBase64: (await box.files.read(`${WORK_DIR}/${f.path}`, { encoding: "base64" })).content } : f);
  }
  return out;
}

export const exportAgent: Leaf = {
  summary: "Export an agent's setup as JSON (template, prompt, MCP, skills, files); never its env",
  usage: "easybits agents export <agent> [--out <file>] [--show-secrets] [--with-files]",
  options: {
    out: { type: "string", value: "file", description: "Write to a file instead of stdout" },
    "show-secrets": { type: "boolean", description: "Keep MCP env/header values unmasked (needed to re-create from the file)" },
    "with-files": { type: "boolean", description: `Include the contents of ${WORK_DIR} (base64)` },
  },
  examples: [
    "easybits agents export helper --out helper.json",
    "easybits agents export helper --show-secrets --with-files --out helper.json && easybits agents create --from helper.json --name helper-2",
  ],
  async run(ctx) {
    const id = need(ctx, 0, "agent", this.usage);
    const x = await buildExport(ctx, id, { secrets: bool(ctx, "show-secrets"), fileContents: bool(ctx, "with-files") });
    const out = str(ctx, "out");
    if (out) {
      writeFileSync(out, JSON.stringify(x, null, 2) + "\n", { mode: bool(ctx, "show-secrets") ? 0o600 : 0o644 });
      const summary = { out: resolve(out), template: x.template, skills: x.skills?.length ?? 0, mcpServers: x.mcpServers?.length ?? 0, files: x.files?.length ?? 0 };
      emit(ctx, summary, () => console.log(t(`Exported ${id} to ${summary.out} (${summary.skills} skill(s), ${summary.mcpServers} MCP, ${summary.files} file(s))`, `Exportado ${id} a ${summary.out} (${summary.skills} skill(s), ${summary.mcpServers} MCP, ${summary.files} archivo(s))`)));
      return;
    }
    // Sin --out el JSON ES la salida, con o sin --json.
    process.stdout.write(JSON.stringify(x, null, 2) + "\n");
  },
};

/** Lee un export de disco y lo valida lo justo. */
export function readExport(path: string, usage: string): AgentExport {
  if (!existsSync(path)) throw usageError(t(`File not found: ${path}`, `No existe el archivo: ${path}`), usage);
  let x: AgentExport;
  try {
    x = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw usageError(t(`${path} is not JSON: ${(e as Error).message}`, `${path} no es JSON: ${(e as Error).message}`), usage);
  }
  if (x?.kind !== "easybits.agent" || !x.template) throw usageError(t(`${path} is not an agent export (easybits agents export).`, `${path} no es un export de agente (easybits agents export).`), usage);
  return x;
}

/**
 * `POST /agents` regresa en ~2 s y la caja sigue arrancando: un PATCH o un PUT inmediato da 500.
 * Se espera a que la máquina conteste su prompt (máx `ms`). Avisa en stderr para humanos.
 */
export async function waitMachine(ctx: Ctx, id: string, ms = 120_000): Promise<void> {
  const until = Date.now() + ms;
  if (!ctx.json) process.stderr.write(t("Waiting for the agent's machine", "Esperando la máquina del agente"));
  let last = "";
  while (Date.now() < until) {
    const p = await soft(() => getPrompt(ctx, id));
    if (p.ok) {
      if (!ctx.json) process.stderr.write(t(" ready\n", " lista\n"));
      return;
    }
    last = p.error;
    if (!ctx.json) process.stderr.write(".");
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!ctx.json) process.stderr.write("\n");
  throw new CliError(t(`Agent ${id} was created but its machine did not answer in ${ms / 1000}s: ${last}`, `El agente ${id} se creó pero su máquina no contestó en ${ms / 1000}s: ${last}`), EXIT.API, t(`Check it: easybits agents doctor ${id}`, `Revísalo: easybits agents doctor ${id}`));
}

/** Tras crear el clon: skills (y reinicio para que entren) + archivos. Devuelve qué se copió. */
export async function applyExport(ctx: Ctx, id: string, x: AgentExport, opts: { files: boolean }) {
  const copied = { skills: [] as string[], files: [] as string[], skippedFiles: [] as string[] };
  for (const s of x.skills ?? []) {
    await api(ctx, "PUT", `/agents/${id}/skills/${s.slug}`, { markdown: s.markdown, assets: s.assets });
    copied.skills.push(s.slug);
  }
  if (opts.files) {
    for (const f of x.files ?? []) {
      if (f.contentBase64 == null) {
        copied.skippedFiles.push(f.path);
        continue;
      }
      await api(ctx, "PUT", `/agents/${id}/files/${encodePath(f.path)}`, Buffer.from(f.contentBase64, "base64"), { raw: true });
      copied.files.push(f.path);
    }
  }
  if (copied.skills.length) await restartAgent(ctx, id);
  return copied;
}

export { hasMasked };
