import { existsSync, readFileSync, statSync } from "node:fs";
import type { AgentInfo } from "@easybits.cloud/sdk";
import type { Command } from "../types.js";
import { ENV_FILE_OPTION, bool, envFrom, int, need, str } from "../args.js";
import { emit, fmtDate, table } from "../output.js";
import { api } from "../api.js";
import { resolveRef } from "../resolve.js";
import {
  type AgentExport,
  applyExport,
  buildExport,
  doctor,
  files,
  get,
  MACHINE_TEMPLATES,
  hasMasked,
  logs,
  mcp,
  parseMcpFile,
  readExport,
  restart,
  set,
  skills,
  tryTurn,
  waitMachine,
} from "./agents-config.js";
import { getClient } from "../client.js";
import { applyTarget, exportSpec } from "./spec.js";
import { usageError } from "../errors.js";
import { YES_OPTION, applyHint, confirm, requireYesIfHeadless } from "../prompt.js";
import { t } from "../i18n.js";

/** ¿Es el JSON de clonado de 0.9 (`kind: easybits.agent`)? Si no, es un archivo de agente nuevo. */
function isLegacyExport(path: string): boolean {
  try {
    return existsSync(path) && !statSync(path).isDirectory() && /"kind"\s*:\s*"easybits\.agent"/.test(readFileSync(path, "utf8"));
  } catch {
    return false;
  }
}

export const agents: Command = {
  name: "agents",
  aliases: ["agent"],
  group: "Compute",
  summary: "Agents running in their own sandbox",
  synopsis: "agents",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your agents",
      usage: "easybits agents ls",
      examples: ["easybits agents ls --json"],
      async run(ctx) {
        const eb = await getClient(ctx);
        const items = await eb.listAgents();
        emit(ctx, items, () =>
          table(
            items.map((a) => ({ ...a, createdAt: fmtDate(a.createdAt) })),
            [["agentId", "ID"], ["name", "NAME"], ["template", "TEMPLATE"], ["status", "STATUS"], ["createdAt", "CREATED"]],
            t("No agents. Create one: easybits agents create --template <template>", "No hay agentes. Crea uno: easybits agents create --template <template>"),
          ),
        );
      },
    },
    get,
    create: {
      aliases: ["new"],
      summary: "Create an agent from a template, or clone one (--like / --from)",
      usage: "easybits agents create (--template <template> | --like <agent> | --from <export.json>) [--name <name>] [--prompt <text> | --prompt-file <file>] [--prompt-mode append|replace] [--mcp-file <json>] [--copy-files] [--dotenv <path>] [--env K=V]... [--ttl <s>] [--dry-run]",
      options: {
        template: { type: "string", value: "template", description: "Agent template (see: easybits docs agents)" },
        like: { type: "string", value: "agent", description: "Clone another agent's setup: template, prompt, MCP, skills (never its env)" },
        from: { type: "string", value: "file", description: "Clone from `easybits agents export` output" },
        name: { type: "string", value: "name", description: "Label" },
        prompt: { type: "string", value: "text", description: "System prompt (ghosty-lite, goose)" },
        "prompt-file": { type: "string", value: "file", description: "System prompt from a file" },
        "prompt-mode": { type: "string", value: "mode", description: "append (default) or replace the engine's prompt" },
        "mcp-file": { type: "string", value: "json", description: "MCP servers: JSON array or { servers } (ACP templates)" },
        "copy-files": { type: "boolean", description: `--like/--from: also copy the knowledge files in /data/work` },
        env: { type: "string", multiple: true, value: "K=V", description: "Env for the agent, non-secret (repeatable)" },
        ...ENV_FILE_OPTION,
        ttl: { type: "string", value: "seconds", description: "Lifetime before auto-destroy (was --timeout)" },
        "dry-run": { type: "boolean", description: "Print the plan; create nothing" },
      },
      examples: [
        "easybits agents create --template ghosty-lite --name helper --prompt-file PROMPT.md",
        "easybits agents create --template chat-anthropic --dotenv .env --json",
        "easybits agents create --like helper --name helper-2 --dry-run",
        "easybits agents create --like helper --name helper-2 --copy-files --dotenv .env",
        "easybits agents create --from helper.json --name helper-3",
      ],
      async run(ctx) {
        const like = str(ctx, "like");
        const from = str(ctx, "from");
        if (like && from) throw usageError(t("Use --like or --from, not both.", "Usa --like o --from, no los dos."), this.usage);
        const promptInline = str(ctx, "prompt");
        const promptFile = str(ctx, "prompt-file");
        if (promptInline != null && promptFile) throw usageError(t("Use --prompt or --prompt-file, not both.", "Usa --prompt o --prompt-file, no los dos."), this.usage);
        const mode = str(ctx, "prompt-mode");
        if (mode && mode !== "append" && mode !== "replace") throw usageError(t("--prompt-mode must be append or replace.", "--prompt-mode debe ser append o replace."), this.usage);
        if (promptFile && !existsSync(promptFile)) throw usageError(t(`File not found: ${promptFile}`, `No existe el archivo: ${promptFile}`), this.usage);
        const mcpFile = str(ctx, "mcp-file");
        if (mcpFile && !existsSync(mcpFile)) throw usageError(t(`File not found: ${mcpFile}`, `No existe el archivo: ${mcpFile}`), this.usage);
        if (bool(ctx, "copy-files") && !like && !from) throw usageError(t("--copy-files needs --like or --from.", "--copy-files necesita --like o --from."), this.usage);
        // Un archivo de `agents export` (0.10+) es un spec: lo crea `apply --create`, que además
        // sube skills y archivos si es un directorio. El JSON de clonado de 0.9 sigue abajo.
        if (from && !isLegacyExport(from)) {
          await applyTarget(ctx, from, { create: true, name: str(ctx, "name"), dryRun: bool(ctx, "dry-run"), usage: this.usage });
          return;
        }
        // La fuente del clon: otro agente (en vivo, con valores reales del MCP) o un export.
        const source: AgentExport | undefined = from
          ? readExport(from, this.usage)
          : like
            ? await buildExport(ctx, await resolveRef(ctx, "agent", like), { secrets: true, fileContents: bool(ctx, "copy-files") })
            : undefined;
        const template = str(ctx, "template") ?? source?.template;
        if (!template) throw usageError(t("Missing --template (or --like / --from).", "Falta --template (o --like / --from)."), this.usage);
        const env = await envFrom(ctx, this.usage);
        const prompt = promptInline ?? (promptFile ? readFileSync(promptFile, "utf8") : source?.systemPrompt);
        const promptMode = mode ?? source?.systemPromptMode;
        // Un prompt de un renglón viaja en el env de creación. Uno multilínea NO: el env de la
        // caja es un EnvironmentFile de systemd y sandbox-host rechaza el arranque con \n
        // («env value for SYSTEM_PROMPT contains newline») — el agente nacía sin arrancar.
        // Ése se escribe con PATCH al final, que sólo existe en templates con máquina.
        const multiline = !!prompt && /[\r\n]/.test(prompt.trimEnd());
        const promptAfter = multiline ? prompt : undefined;
        if (multiline && !MACHINE_TEMPLATES.has(template)) {
          throw usageError(t(`A multi-line prompt needs a template with a machine (${[...MACHINE_TEMPLATES].join(", ")}).`, `Un prompt de varios renglones necesita un template con máquina (${[...MACHINE_TEMPLATES].join(", ")}).`), this.usage);
        }
        if (prompt && !multiline) env.SYSTEM_PROMPT = prompt.trimEnd();
        if (promptMode && (prompt || mode) && !multiline) env.SYSTEM_PROMPT_MODE = promptMode;
        const mcpServers = mcpFile ? parseMcpFile(readFileSync(mcpFile, "utf8"), this.usage) : source?.mcpServers;
        if (mcpServers && hasMasked(mcpServers)) {
          throw usageError(t(`${from ?? "the source"} has masked MCP values (…***).`, `${from ?? "la fuente"} trae valores del MCP tapados (…***).`), t("Re-export with --show-secrets, or pass --mcp-file", "Vuelve a exportar con --show-secrets, o pasa --mcp-file"));
        }
        const name = str(ctx, "name") ?? (source?.name ? `${source.name}-copy` : undefined);
        const plan = {
          template,
          name: name ?? null,
          envKeys: Object.keys(env),
          promptBytes: prompt ? Buffer.byteLength(prompt) : 0,
          promptMode: promptMode ?? null,
          mcpServers: (mcpServers ?? []).map((s) => s.name),
          skills: (source?.skills ?? []).map((s) => s.slug),
          files: bool(ctx, "copy-files") ? (source?.files ?? []).map((f) => f.path) : [],
          ...(source ? { from: source.source.agentId } : {}),
        };
        if (bool(ctx, "dry-run")) {
          emit(ctx, { dryRun: true, ...plan }, () => {
            for (const [k, v] of Object.entries(plan)) console.log(`${k.padEnd(12)} ${Array.isArray(v) ? v.join(", ") || "-" : v ?? "-"}`);
            if (source) console.log(t("Env is never copied: pass the engine's keys with --dotenv.", "El env nunca se copia: pasa las llaves del motor con --dotenv."));
            console.log(t("(dry run: nothing created)", "(simulación: no se creó nada)"));
            console.log(applyHint(ctx));
          });
          return;
        }
        const a = await api<AgentInfo>(ctx, "POST", "/agents", {
          template,
          name,
          env,
          timeoutSeconds: int(ctx, "ttl", this.usage),
          ...(mcpServers?.length ? { mcpServers } : {}),
        });
        if (promptAfter || source?.skills?.length || (bool(ctx, "copy-files") && source?.files?.length)) await waitMachine(ctx, a.agentId);
        const copied = source ? await applyExport(ctx, a.agentId, source, { files: bool(ctx, "copy-files") }) : undefined;
        // Después del reinicio de applyExport: el PATCH rearma los ganchos en caliente, sin reboot.
        if (promptAfter) await api(ctx, "PATCH", `/agents/${a.agentId}`, { systemPrompt: promptAfter, ...(promptMode ? { systemPromptMode: promptMode } : {}) });
        emit(ctx, { ...a, ...(copied ? { copied } : {}) }, () => {
          console.log(`${t("Agent:  ", "Agente: ")} ${a.agentId}`);
          console.log(`Sandbox: ${a.sandboxId}`);
          console.log(`URL:     ${a.agentUrl}`);
          // Con --prompt/--prompt-file el prompt ya va aplicado: se dice cuál, no se pide otra vez.
          if (prompt) {
            const origin = promptFile ?? (promptInline != null ? "--prompt" : `${t("from", "de")} ${source?.source.agentId ?? "export"}`);
            console.log(`Prompt:  ${origin}, ${prompt.length.toLocaleString("en-US")} ${t("chars", "caracteres")}`);
          }
          if (copied) console.log(t(`Copied:  ${copied.skills.length} skill(s), ${copied.files.length} file(s)${copied.skippedFiles.length ? ` (${copied.skippedFiles.length} skipped: export without --with-files)` : ""}`, `Copiado: ${copied.skills.length} skill(s), ${copied.files.length} archivo(s)${copied.skippedFiles.length ? ` (${copied.skippedFiles.length} sin copiar: export sin --with-files)` : ""}`));
          console.log(t(`Talk to it: easybits agents try ${a.agentId} "hello"`, `Háblale: easybits agents try ${a.agentId} "hola"`));
        });
      },
    },
    message: {
      aliases: ["msg", "send"],
      summary: "Send a message (agent by id or name); streams the reply",
      usage: "easybits agents message <agent> <text...> [--session <id>]",
      options: { session: { type: "string", value: "id", description: "Continue a conversation" } },
      examples: ['easybits agents message helper "summarize /data/work/README.md"', "easybits agents message 6650f0c2a1b2c3d4e5f60718 hi --json"],
      async run(ctx) {
        const id = need(ctx, 0, "agent", this.usage);
        const content = ctx.args.slice(1).join(" ");
        if (!content) throw usageError(t("Missing <text>.", "Falta <text>."), this.usage);
        const eb = await getClient(ctx);
        const params = { content, sessionId: str(ctx, "session") };
        if (ctx.json) {
          emit(ctx, await eb.messageAgent(id, params), () => {});
          return;
        }
        for await (const tok of eb.streamAgent(id, params)) process.stdout.write(tok);
        process.stdout.write("\n");
      },
    },
    destroy: {
      aliases: ["rm", "delete"],
      summary: "Destroy an agent and its sandbox",
      usage: "easybits agents destroy <agent> [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits agents destroy helper            # asks you to type the id", "easybits agents destroy helper --yes"],
      async run(ctx) {
        const id = need(ctx, 0, "agent", this.usage);
        requireYesIfHeadless(ctx);
                // Se lleva su caja y su /data: se teclea el id (patrón de `gh repo delete`).
        await confirm(ctx, t(`Destroy agent ${id} and its sandbox (including /data)?`, `¿Destruir el agente ${id} y su sandbox (con /data)?`), { typeName: id });
        const eb = await getClient(ctx);
        const r = await eb.destroyAgent(id);
        emit(ctx, { ...r, agentId: id }, () => console.log(t(`Destroyed ${id}`, `Destruido ${id}`)));
      },
    },
    set,
    files,
    skills,
    mcp,
    restart,
    try: tryTurn,
    logs,
    doctor,
    export: exportSpec,
  },
};
