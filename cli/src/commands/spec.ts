// El agente como ARCHIVO: `easybits agents export <agente> [--out DIR|archivo]` y
// `easybits apply <archivo|dir>`. El formato y el PLAN viven en el servidor
// (app/.server/core/agentSpec.ts): sólo él ve el env y los secretos del MCP, así que compara y
// conserva un secreto sin que salga. Aquí se lee y escribe en disco, se mandan los valores de
// los `${NOMBRE}` que el archivo nombra y existen en tu entorno, se enseña el plan y se confirma.
// Con `--out DIR` el export trae también las skills (`skills/<slug>/…`) y los archivos de
// conocimiento (`files/…`), y `apply DIR` los vuelve a subir: el directorio es el agente entero.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Command, Ctx, Leaf } from "../types.js";
import { readUploads, secretsFor, specId } from "../specfile.js";
import { bool, need, str } from "../args.js";
import { emit } from "../output.js";
import { api } from "../api.js";
import { resolveRef } from "../resolve.js";
import { EXIT, usageError } from "../errors.js";
import { YES_OPTION, confirm, requireYesIfHeadless } from "../prompt.js";
import { buildExport, exportAgent, waitMachine } from "./agents-config.js";
import { serverText, t } from "../i18n.js";

type Change = { op: "+" | "~" | "-" | "!"; what: string };
type ApplyRes = { agent: string; dryRun: boolean; plan: Change[]; applied?: string[]; failed?: { what: string; error: string }; before?: string };
type CreateRes = { dryRun: boolean; plan: Change[]; agentId?: string; sandboxId?: string };

const SPEC_NAMES = ["agent.yaml", "agent.yml", "agent.json"];
const isFileTarget = (p: string) => /\.(ya?ml|json)$/i.test(p);

// ── export ────────────────────────────────────────────────────────────────────────────────

export const exportSpec: Leaf = {
  summary: "Export an agent as a file you can edit and apply (secrets as ${NAME}, never their value)",
  usage: "easybits agents export <agent> [--out <dir | file.yaml | file.json>]",
  options: {
    out: { type: "string", value: "path", description: "A folder (agent.yaml + skills/ + files/) or a .yaml/.json file" },
    // El formato de clonado de 0.9 (JSON con contenidos), para `create --from` viejo.
    "show-secrets": { type: "boolean", description: "Legacy clone JSON (0.9) with MCP values unmasked" },
    "with-files": { type: "boolean", description: "Legacy clone JSON (0.9) with the file contents" },
  },
  examples: [
    "easybits agents export helper > helper.yaml",
    "easybits agents export helper --out ./helper      # agent.yaml + skills/ + files/, versionable in git",
    "easybits apply ./helper --dry-run                 # after editing: see the plan",
  ],
  async run(ctx) {
    if (bool(ctx, "show-secrets") || bool(ctx, "with-files")) return exportAgent.run.call(exportAgent, ctx);
    const id = need(ctx, 0, "agent", this.usage);
    const out = str(ctx, "out");
    const getYaml = () => api<string>(ctx, "GET", `/agents/${id}/export`);
    const getJson = async () => (await api<{ spec: unknown }>(ctx, "GET", `/agents/${id}/export?format=json`)).spec;
    if (!out) {
      // Sin --out el archivo ES la salida (YAML); con --json, el mismo contenido como JSON.
      if (ctx.json) return emit(ctx, await getJson(), () => {});
      process.stdout.write(await getYaml());
      return;
    }
    if (isFileTarget(out)) {
      writeFileSync(out, /\.json$/i.test(out) ? JSON.stringify(await getJson(), null, 2) + "\n" : await getYaml());
      emit(ctx, { saved: resolve(out) }, () => console.log(t(`Saved ${resolve(out)}\nEdit it, then: easybits apply ${out} --dry-run`, `Guardado ${resolve(out)}\nEdítalo y luego: easybits apply ${out} --dry-run`)));
      return;
    }
    // Directorio: el archivo + el contenido de skills y archivos, para que `apply DIR` los suba.
    const yaml = await getYaml();
    const dir = resolve(out);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "agent.yaml"), yaml);
    const x = await buildExport(ctx, id, { secrets: false, fileContents: true });
    const put = (path: string, b64: string) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, Buffer.from(b64, "base64"));
    };
    for (const s of x.skills ?? []) {
      writeFileSync((mkdirSync(join(dir, "skills", s.slug), { recursive: true }), join(dir, "skills", s.slug, "SKILL.md")), s.markdown);
      for (const a of s.assets) put(join(dir, "skills", s.slug, a.name), a.contentBase64);
    }
    for (const f of x.files ?? []) if (f.contentBase64 !== undefined) put(join(dir, "files", f.path), f.contentBase64);
    const summary = { saved: dir, skills: (x.skills ?? []).map((s) => s.slug), files: (x.files ?? []).map((f) => f.path) };
    emit(ctx, summary, () =>
      console.log(
        `${t("Saved", "Guardado")} ${dir}/agent.yaml${summary.skills.length ? ` + skills/ (${summary.skills.join(", ")})` : ""}${summary.files.length ? ` + files/ (${summary.files.length})` : ""}\n${t("Edit it, then", "Edítalo y luego")}: easybits apply ${out} --dry-run`,
      ),
    );
  },
};

// ── apply ─────────────────────────────────────────────────────────────────────────────────

function readTarget(target: string, usage: string): { text: string; dir?: string } {
  if (!existsSync(target)) throw usageError(t(`Not found: ${target}`, `No existe: ${target}`), usage);
  if (statSync(target).isDirectory()) {
    const name = SPEC_NAMES.find((n) => existsSync(join(target, n)));
    if (!name) throw usageError(t(`${target} has no agent.yaml.`, `${target} no tiene agent.yaml.`), usage);
    return { text: readFileSync(join(target, name), "utf8"), dir: target };
  }
  return { text: readFileSync(target, "utf8") };
}

const line = (c: Change) => `${c.op} ${c.what}`;
const printPlan = (plan: Change[]) => console.log(plan.map(line).join("\n"));

/** Guarda el archivo de ANTES (sin secretos) para poder volver con `easybits apply <respaldo>`. */
function saveBackup(id: string, yaml: string): string {
  const dir = join(homedir(), ".easybits", "backups");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}-${new Date().toISOString().replace(/[:.]/g, "-")}.yaml`);
  writeFileSync(path, yaml);
  return path;
}

export type ApplyOpts = { agent?: string; create?: boolean; name?: string; prune?: boolean; dryRun?: boolean; usage: string };

export async function applyTarget(ctx: Ctx, target: string, o: ApplyOpts): Promise<void> {
  const { text, dir } = readTarget(target, o.usage);
  const { secrets, missing } = secretsFor(text);
  const uploads = dir ? readUploads(dir) : {};

  if (o.create) {
    if (o.agent) throw usageError(t("Use --agent or --create, not both.", "Usa --agent o --create, no los dos."), o.usage);
    const body = { spec: text, secrets, ...(o.name ? { name: o.name } : {}) };
    const plan = await api<CreateRes>(ctx, "POST", "/agents/apply", { ...body, dryRun: true });
    if (o.dryRun) {
      emit(ctx, { create: true, ...plan, ...(uploads.skills ? { skills: Object.keys(uploads.skills) } : {}), ...(uploads.files ? { files: Object.keys(uploads.files) } : {}) }, () => {
        printPlan(plan.plan);
        for (const s of Object.keys(uploads.skills ?? {})) console.log(`+ skill ${s}`);
        for (const f of Object.keys(uploads.files ?? {})) console.log(`+ file ${f}`);
        console.log(t("(dry run: nothing created)", "(simulación: no se creó nada)"));
      });
      return;
    }
    const created = await api<CreateRes>(ctx, "POST", "/agents/apply", body);
    const id = created.agentId!;
    if (!ctx.json) process.stderr.write(t(`Created ${id}; applying the rest…\n`, `Creado ${id}; aplicando lo demás…\n`));
    // Lo que vive en la caja (skills, archivos) entra cuando la máquina contesta.
    let rest: ApplyRes | undefined;
    if (/\n?(skills|files):/m.test(text) || uploads.skills || uploads.files) {
      await waitMachine(ctx, id).catch(() => {}); // sin máquina (otro template): el apply lo dirá con `!`
      rest = await api<ApplyRes>(ctx, "POST", `/agents/${id}/apply`, { spec: text, secrets, ...uploads, ...(o.name ? { name: o.name } : {}) });
    }
    const extra = (rest?.plan ?? []).filter((c) => c.op !== "!" && !/^(prompt|env)\b/.test(c.what));
    const res = { agentId: id, sandboxId: created.sandboxId, plan: [...created.plan, ...extra], applied: rest?.applied, failed: rest?.failed };
    emit(ctx, res, () => {
      printPlan(res.plan);
      console.log(t(`Created ${id}.${res.failed ? "" : ` Try it: easybits agents try ${id} "hello"`}`, `Creado ${id}.${res.failed ? "" : ` Pruébalo: easybits agents try ${id} "hola"`}`));
      if (res.failed) console.error(t(`Stopped at «${res.failed.what}»: ${res.failed.error}`, `Se detuvo en «${res.failed.what}»: ${serverText(res.failed.error)}`));
    });
    if (res.failed) process.exitCode = EXIT.API;
    return;
  }

  const ref = o.agent ?? specId(text);
  if (!ref) throw usageError(t("The file has no agent id.", "El archivo no trae id de agente."), t("Point it at one with --agent <name|id>, or make a new one with --create.", "Apúntalo a uno con --agent <nombre|id>, o crea uno nuevo con --create."));
  const id = await resolveRef(ctx, "agent", ref);
  if (missing.length && !ctx.json) process.stderr.write(t(`Not in your environment (keep their current value): ${missing.join(", ")}\n`, `No están en tu entorno (conservan su valor de hoy): ${missing.join(", ")}\n`));
  const path = `/agents/${id}/apply`;
  const body = { spec: text, secrets, ...uploads, ...(o.prune ? { prune: true } : {}) };
  const plan = await api<ApplyRes>(ctx, "POST", path, { ...body, dryRun: true });
  const actionable = plan.plan.filter((c) => c.op !== "!");
  if (o.dryRun || !actionable.length) {
    emit(ctx, plan, () => {
      if (plan.plan.length) printPlan(plan.plan);
      console.log(
        actionable.length
          ? t("(dry run: nothing changed)", "(simulación: no cambió nada)")
          : plan.plan.length
            ? t("Nothing to apply (see the ! lines).", "Nada que aplicar (mira los renglones con !).")
            : t("No changes: the agent already matches the file.", "Sin cambios: el agente ya coincide con el archivo."),
      );
    });
    return;
  }
  requireYesIfHeadless(ctx);
  await confirm(ctx, `${plan.plan.map(line).join("\n")}\n${t(`Apply ${actionable.length} change(s) to ${id}?`, `¿Aplicar ${actionable.length} cambio(s) a ${id}?`)}`);
  const r = await api<ApplyRes>(ctx, "POST", path, body);
  const backup = r.before ? saveBackup(id, r.before) : undefined;
  const { before: _b, ...shown } = r;
  emit(ctx, { ...shown, ...(backup ? { backup } : {}) }, () => {
    console.log(t(`Applied ${r.applied?.length ?? 0} change(s) to ${id}.`, `${r.applied?.length ?? 0} cambio(s) aplicados a ${id}.`));
    if (backup) console.log(t(`Before (to roll back: easybits apply ${backup} --agent ${id}): ${backup}`, `Lo de antes (para volver: easybits apply ${backup} --agent ${id}): ${backup}`));
    if (r.failed) console.error(t(`Stopped at «${r.failed.what}»: ${r.failed.error}`, `Se detuvo en «${r.failed.what}»: ${serverText(r.failed.error)}`));
  });
  if (r.failed) process.exitCode = EXIT.API;
}

export const apply: Command = {
  name: "apply",
  group: "Compute",
  summary: "Make an agent match a file from `agents export` (plan, then apply)",
  synopsis: "apply <file|dir>",
  leaf: {
    summary: "Apply an agent file or folder: shows the plan (+ add, ~ change, - remove, ! skipped), then applies it",
    usage: "easybits apply <file|dir> [--agent <agent>] [--create [--name <name>]] [--prune] [--dry-run] [--yes]",
    options: {
      agent: { type: "string", value: "agent", description: "Apply to this agent (default: the id in the file)" },
      create: { type: "boolean", description: "Make a new agent from the file instead" },
      name: { type: "string", value: "name", description: "--create: name for the new agent" },
      prune: { type: "boolean", description: "Also remove what the file doesn't list (env, MCP, skills, files)" },
      "dry-run": { type: "boolean", description: "Show the plan; change nothing" },
      ...YES_OPTION,
    },
    examples: [
      "easybits agents export helper --out ./helper",
      "easybits apply ./helper --dry-run",
      "ANTHROPIC_API_KEY=… easybits apply ./helper --yes         # ${ANTHROPIC_API_KEY} in the file gets this value",
      "easybits apply ./helper --create --name helper-2          # a copy",
      "easybits apply helper.yaml --prune --dry-run              # what would be removed",
    ],
    async run(ctx) {
      const target = need(ctx, 0, "file|dir", this.usage);
      await applyTarget(ctx, target, {
        agent: str(ctx, "agent"),
        create: bool(ctx, "create"),
        name: str(ctx, "name"),
        prune: bool(ctx, "prune"),
        dryRun: bool(ctx, "dry-run"),
        usage: this.usage,
      });
    },
  },
};

