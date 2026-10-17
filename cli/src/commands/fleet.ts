import type { Command, Ctx } from "../types.js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { bool, need, readStdin, str } from "../args.js";
import { emit, fmtDate, table } from "../output.js";
import { api } from "../api.js";
import { usageError } from "../errors.js";
import { t } from "../i18n.js";

// La flota (FleetAgent): agentes multicanal que rutean cada conversación a una caja efímera
// (WhatsApp, WABA, Teams, web). Va por api() con la credencial de la CUENTA: la API acepta
// al dueño en toda la superficie de un FleetAgent, así que el CLI nunca toca su token.

type FleetRow = { id: string; name?: string | null; assistantName?: string | null; workerTemplate?: string; hasOwnNumber?: boolean; createdAt?: string };
type CapabilitiesView = {
  agent: { systemPrompt: string; workerTemplate: string; model: string; modelLabel: string; effort: string; hasOwnNumber: boolean; buckets: string[] };
  engine: string | null;
  engines: Array<{ id: string; label: string; ready: boolean }>;
  models: Array<{ key: string; label: string }>;
  efforts: string[];
  channels: Array<{ key: string; type: string; label: string }>;
  builtins: Array<{ name: string; label: string }>;
  skills: Array<{ id: string; name: string; enabled: boolean }>;
  customMcps: Array<{ name: string; label: string; transport: string }>;
  secretsPresent: string[];
  [k: string]: unknown;
};

/** Lo que un `ls`/`get` enseña: sin token ni persona (llevan credenciales). */
const fleetRecord = (p: FleetRow) => ({
  id: p.id,
  name: p.name ?? null,
  assistantName: p.assistantName ?? null,
  workerTemplate: p.workerTemplate ?? null,
  hasOwnNumber: !!p.hasOwnNumber,
  createdAt: p.createdAt ?? null,
});

const CONFIGURE_USAGE =
  "easybits fleet configure <agent> [--name <name>] [--prompt-file <file|->] [--engine <id>] [--model <id>] [--effort <level>] [--own-number on|off] [--recycle]";

type ConfigureFlags = { name?: string; prompt?: string; engine?: string; model?: string; effort?: string; ownNumber?: string; recycle?: boolean };

/**
 * Banderas → acciones de POST /fleet-agents/:id/capabilities, en el orden que importa:
 * el motor antes que el modelo (cambiar de motor resetea el modelo) y el reciclado al final.
 */
export function configureActions(f: ConfigureFlags): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (f.name != null) out.push({ action: "set-name", name: f.name });
  if (f.prompt != null) out.push({ action: "set-agent-prompt", systemPrompt: f.prompt });
  if (f.engine != null) out.push({ action: "set-engine", engine: f.engine });
  if (f.model != null) out.push({ action: "set-model", model: f.model });
  if (f.effort != null) {
    if (!["low", "medium", "high", "xhigh", "max"].includes(f.effort)) throw usageError(t("--effort is low, medium, high, xhigh or max.", "--effort es low, medium, high, xhigh o max."), CONFIGURE_USAGE);
    out.push({ action: "set-effort", effort: f.effort });
  }
  if (f.ownNumber != null) {
    if (f.ownNumber !== "on" && f.ownNumber !== "off") throw usageError(t("--own-number is on or off.", "--own-number es on u off."), CONFIGURE_USAGE);
    out.push({ action: "toggle-own-number", on: f.ownNumber === "on" });
  }
  if (f.recycle) out.push({ action: "recycle-box" });
  if (!out.length) throw usageError(t("Nothing to change: pass a flag (--name, --prompt-file, --model…).", "Nada que cambiar: pasa una bandera (--name, --prompt-file, --model…)."), CONFIGURE_USAGE);
  return out;
}

async function readText(path: string, usage: string): Promise<string> {
  if (path === "-") return (await readStdin()).toString("utf8");
  if (!existsSync(path)) throw usageError(t(`File not found: ${path}`, `No existe el archivo: ${path}`), usage);
  return readFileSync(path, "utf8");
}

const caps = (ctx: Ctx, id: string, q?: string) =>
  api<CapabilitiesView>(ctx, "GET", `/fleet-agents/${encodeURIComponent(id)}/capabilities${q ? `?q=${encodeURIComponent(q)}` : ""}`);

export const fleet: Command = {
  name: "fleet",
  aliases: ["flota"],
  group: "Compute",
  summary: "Fleet agents: one agent, many conversations (WhatsApp, WABA, Teams, web)",
  synopsis: "fleet <ls|get|…>",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your fleet agents",
      usage: "easybits fleet ls",
      examples: ["easybits fleet ls", "easybits fleet ls --json"],
      async run(ctx) {
        const { pools } = await api<{ pools: FleetRow[] }>(ctx, "GET", "/fleet-agents");
        const rows = pools.map(fleetRecord);
        emit(ctx, rows, () =>
          table(
            rows.map((r) => ({ ...r, createdAt: fmtDate(r.createdAt) })),
            [["id", "ID"], ["name", "NAME"], ["workerTemplate", "ENGINE"], ["createdAt", "CREATED"]],
            t("No fleet agents yet. Create one at https://www.easybits.cloud/dash/flota", "Todavía no hay agentes de flota. Crea uno en https://www.easybits.cloud/dash/flota"),
          ),
        );
      },
    },
    get: {
      summary: "Show a fleet agent: engine, model, effort, prompt and channels",
      usage: "easybits fleet get <agent> [--prompt-out <file>]",
      options: { "prompt-out": { type: "string", value: "file", description: "Write the system prompt to a file instead of printing it" } },
      examples: ["easybits fleet get soporte", "easybits fleet get soporte --json", "easybits fleet get soporte --prompt-out PROMPT.md"],
      async run(ctx) {
        const id = need(ctx, 0, "agent", this.usage);
        const [{ pools }, view] = await Promise.all([api<{ pools: FleetRow[] }>(ctx, "GET", "/fleet-agents"), caps(ctx, id)]);
        const rec = fleetRecord(pools.find((p) => p.id === id) ?? { id });
        const out: Record<string, unknown> = { ...rec, ...view.agent, engine: view.engine, channels: view.channels.map((c) => c.key), skills: view.skills, customMcps: view.customMcps };
        const promptOut = str(ctx, "prompt-out");
        if (promptOut) {
          const { writeFileSync } = await import("node:fs");
          writeFileSync(promptOut, view.agent.systemPrompt);
          out.systemPrompt = { file: promptOut, bytes: Buffer.byteLength(view.agent.systemPrompt) };
        }
        emit(ctx, out, () => {
          console.log(`ID:       ${rec.id}${rec.name ? `  (${rec.name})` : ""}`);
          console.log(`${t("Engine:  ", "Motor:   ")} ${view.engine ?? view.agent.workerTemplate}${view.agent.modelLabel ? ` · ${view.agent.modelLabel}` : ""} · effort ${view.agent.effort}`);
          console.log(`${t("Number:  ", "Número:  ")} ${view.agent.hasOwnNumber ? t("dedicated", "dedicado") : t("shared (replies carry the name prefix)", "compartido (las respuestas llevan el nombre)")}`);
          console.log(`${t("Channels:", "Canales: ")} ${view.channels.map((c) => c.key).join(", ")}`);
          if (view.skills.length) console.log(`Skills:   ${view.skills.map((s) => `${s.name}${s.enabled ? "" : " (off)"}`).join(", ")}`);
          if (view.customMcps.length) console.log(`MCP:      ${view.customMcps.map((m) => m.name).join(", ")}`);
          if (promptOut) console.log(t(`Prompt written to ${promptOut}`, `Prompt escrito en ${promptOut}`));
          else console.log(`\n${view.agent.systemPrompt || t("(no system prompt)", "(sin system prompt)")}`);
        });
      },
    },
    capabilities: {
      aliases: ["caps"],
      summary: "The catalog and current state: engines, models, tool buckets, MCPs, skills, channels",
      usage: "easybits fleet capabilities <agent> [--q <text>]",
      options: { q: { type: "string", value: "text", description: "Filter the capabilities catalog" } },
      examples: ["easybits fleet capabilities soporte --json", "easybits fleet caps soporte --q calendar"],
      async run(ctx) {
        const id = need(ctx, 0, "agent", this.usage);
        const view = await caps(ctx, id, str(ctx, "q"));
        emit(ctx, view, () => {
          console.log(`${t("Engines:", "Motores:")}  ${view.engines.map((e) => `${e.id}${e.id === view.engine ? "*" : ""}${e.ready ? "" : " (soon)"}`).join(", ")}`);
          console.log(`${t("Models: ", "Modelos:")}  ${view.models.map((m) => `${m.key}${m.key === view.agent.model ? "*" : ""}`).join(", ") || "-"}`);
          console.log(`Effort:   ${view.efforts.map((e) => `${e}${e === view.agent.effort ? "*" : ""}`).join(", ")}`);
          console.log(`Buckets:  ${view.agent.buckets.join(", ") || "-"}`);
          console.log(`${t("Built-in:", "Incluidos:")} ${view.builtins.map((b) => b.name).join(", ")}`);
          console.log(`${t("Channels:", "Canales:")}  ${view.channels.map((c) => c.key).join(", ")}`);
          console.log(`${t("Secrets: ", "Secretos:")}  ${view.secretsPresent.join(", ") || "-"}`);
          console.log(t("(* = current. --json has the full view: per-channel config, buckets and their tools.)", "(* = el actual. --json trae la vista completa: config por canal, buckets y sus tools.)"));
        });
      },
    },
    configure: {
      aliases: ["set"],
      summary: "Change name, system prompt, engine, model, effort or number mode; --recycle applies it now",
      usage: CONFIGURE_USAGE,
      options: {
        name: { type: "string", value: "name", description: "Display name and the name the agent goes by" },
        "prompt-file": { type: "string", value: "file|-", description: "System prompt for every channel (- reads stdin)" },
        engine: { type: "string", value: "id", description: "Engine (claude, deepseek, codex…); recycles its boxes by itself" },
        model: { type: "string", value: "id", description: "Model of the current engine (see fleet capabilities)" },
        effort: { type: "string", value: "level", description: "low, medium, high, xhigh or max" },
        "own-number": { type: "string", value: "on|off", description: "on: dedicated number (no name prefix on replies)" },
        recycle: { type: "boolean", description: "Recycle its running boxes so the change applies on the next turn" },
      },
      examples: [
        "easybits fleet configure soporte --prompt-file PROMPT.md",
        "easybits fleet configure soporte --model claude-sonnet-5-5 --effort high --recycle",
        "easybits fleet configure soporte --name Nik --own-number on",
      ],
      async run(ctx) {
        const id = need(ctx, 0, "agent", CONFIGURE_USAGE);
        const promptFile = str(ctx, "prompt-file");
        const actions = configureActions({
          name: str(ctx, "name"),
          prompt: promptFile ? await readText(promptFile, CONFIGURE_USAGE) : undefined,
          engine: str(ctx, "engine"),
          model: str(ctx, "model"),
          effort: str(ctx, "effort"),
          ownNumber: str(ctx, "own-number"),
          recycle: bool(ctx, "recycle"),
        });
        const applied: string[] = [];
        // Una por una: si una falla, las anteriores ya quedaron y el error dice cuál.
        for (const a of actions) {
          await api(ctx, "POST", `/fleet-agents/${encodeURIComponent(id)}/capabilities`, a);
          applied.push(String(a.action));
        }
        emit(ctx, { ok: true, applied }, () => {
          console.log(t(`Applied: ${applied.join(", ")}`, `Aplicado: ${applied.join(", ")}`));
          if (!applied.includes("recycle-box") && !applied.includes("set-engine")) {
            console.log(t("Sleeping boxes pick it up when they wake; a running one when it sleeps (or pass --recycle).", "Las cajas dormidas lo toman al despertar; una corriendo, al dormirse (o pasa --recycle)."));
          }
        });
      },
    },
    message: {
      summary: "Send one message to a fleet agent and print its reply",
      usage: "easybits fleet message <agent> <text|-> [--group <id>] [--config-group <id>] [--sender <who>] [--timezone <tz>]",
      options: {
        group: { type: "string", value: "id", description: "Conversation id; reuse it to continue (default: a new cli-<uuid>)" },
        "config-group": { type: "string", value: "id", description: "Channel whose config (tools, MCP, prompt) applies, e.g. web or waba:<id>" },
        sender: { type: "string", value: "who", description: "Who is writing (phone, user id)" },
        timezone: { type: "string", value: "tz", description: "IANA timezone for the turn, e.g. America/Mexico_City" },
      },
      examples: [
        'easybits fleet message soporte "¿qué horarios tienen?" --config-group web',
        'easybits fleet message soporte "y el sábado?" --group cli-1234 --config-group web   # same conversation',
        "cat pregunta.txt | easybits fleet message soporte - --json",
      ],
      async run(ctx) {
        const id = need(ctx, 0, "agent", this.usage);
        let text = ctx.args.slice(1).join(" ");
        if (text === "-") text = (await readStdin()).toString("utf8").trim();
        if (!text) throw usageError(t("Missing <text>.", "Falta <text>."), this.usage);
        const groupId = str(ctx, "group") ?? `cli-${randomUUID()}`;
        const r = await api<{ reply: string }>(ctx, "POST", `/fleet-agents/${encodeURIComponent(id)}/message`, {
          groupId,
          text,
          configGroupId: str(ctx, "config-group"),
          sender: str(ctx, "sender"),
          timezone: str(ctx, "timezone"),
        });
        emit(ctx, { ...r, groupId }, () => {
          console.log(r.reply);
          if (!str(ctx, "group")) console.error(t(`(continue with --group ${groupId})`, `(sigue con --group ${groupId})`));
        });
      },
    },
  },
};
