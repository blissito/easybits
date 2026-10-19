import type { Command, Ctx } from "../types.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { bool, list, need, str } from "../args.js";
import { emit, fmtDate, table } from "../output.js";
import { api } from "../api.js";
import { CliError, EXIT, usageError } from "../errors.js";
import { YES_OPTION, confirm, requireYesIfHeadless } from "../prompt.js";
import { t } from "../i18n.js";

// Dos clases de cron en un solo comando:
// - TUS crons (`/api/v2/crons`, cualquier cuenta): pegarle a una URL o mandarle un turno a un
//   agente. Se nombran por id (24 hex) o por nombre exacto.
// - Los de la PLATAFORMA (respaldos, purgas…; `/api/v2/admin/crons`, sólo superusuarios): se
//   nombran por su key (`backup-machines`). `ls --platform` los lista.
// `run`, `runs`, `pause` y `resume` deciden por la forma del argumento: un id de 24 hex o un
// nombre de tus crons es tuyo; una key de la tabla de la plataforma, de la plataforma.

type UserCron = {
  id: string;
  name: string;
  notify?: { on: "failure" | "always"; push?: { secret: string }; email?: true; inbox?: string } | null;
  until?: string | null;
  timesLeft?: number | null;
  kind?: "once" | "recurring";
  cron: string;
  at?: string | null;
  timezone: string;
  schedule: string;
  enabled: boolean;
  done?: boolean;
  nextRunLocal?: string | null;
  in?: string | null;
  action:
    | { type: "http"; method: string; url: string; secretName?: string }
    | { type: "agent_turn"; fleetAgentId: string; prompt: string }
    | { type: "exec"; command: string; template?: string; files?: { path: string }[]; secrets?: { name: string; file?: string }[] };
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastOk: boolean | null;
  lastStatus: number | null;
  lastError: string | null;
};

const HEX24 = /^[a-f0-9]{24}$/;
/** Las keys de la plataforma son kebab-case sin dígitos hex de 24: nunca chocan con un id. Puro, con test. */
export const isUserCronId = (ref: string) => HEX24.test(ref);

/** Lo que hace un cron, en una línea. Puro, con test. */
export function describeCronAction(a: UserCron["action"]): string {
  if (a.type === "http") return `${a.method} ${a.url}${a.secretName ? ` (+${a.secretName})` : ""}`;
  if (a.type === "exec") {
    const extra = [a.files?.length ? `${a.files.length} file(s)` : "", a.secrets?.length ? `+${a.secrets.map((x) => x.name).join(",")}` : ""].filter(Boolean).join(" ");
    return `run: ${a.command.length > 40 ? a.command.slice(0, 39) + "…" : a.command}${extra ? ` (${extra})` : ""}`;
  }
  return `agent ${a.fleetAgentId}: ${a.prompt.length > 40 ? a.prompt.slice(0, 39) + "…" : a.prompt}`;
}

/** Un cron en renglones legibles para `crons get`. Pura, con test. */
export function describeCron(c: UserCron): string[] {
  const n = c.notify;
  const chans = n ? [n.push ? "push" : "", n.email ? "email" : "", n.inbox ? `inbox:${n.inbox}` : ""].filter(Boolean).join(", ") : "";
  const state = c.enabled ? t("active", "activo") : c.done ? t("done", "terminado") : t("paused", "en pausa");
  return [
    `${c.id} «${c.name}» (${state})`,
    `${t("Schedule", "Horario")}: ${c.schedule} (${c.timezone})${c.until ? ` ${t("until", "hasta")} ${c.until}` : ""}${c.timesLeft != null ? ` · ${t("runs left", "ejecuciones restantes")}: ${c.timesLeft}` : ""}`,
    `${t("Next run", "Próxima")}: ${c.enabled && c.nextRunLocal ? `${c.nextRunLocal} (${c.in})` : "—"}`,
    `${t("Does", "Hace")}: ${describeCronAction(c.action)}`,
    `${t("Notifies", "Avisa")}: ${chans ? `${chans} (${n!.on === "always" ? t("always", "siempre") : t("on failure", "si falla")})` : "—"}`,
    `${t("Last run", "Última")}: ${c.lastRunAt ? `${fmtDate(c.lastRunAt)} ${c.lastOk === false ? t("failed", "falló") : "ok"}${c.lastError ? ` — ${c.lastError}` : ""}` : "—"}`,
  ];
}

/** id, o nombre exacto (sin mayúsculas) de uno de TUS crons. null si no es tuyo. */
async function resolveUserCron(ctx: Ctx, ref: string): Promise<UserCron | null> {
  const { items } = await api<{ items: UserCron[] }>(ctx, "GET", "/crons");
  const byId = items.find((c) => c.id === ref);
  if (byId) return byId;
  const byName = items.filter((c) => c.name.toLowerCase() === ref.trim().toLowerCase());
  if (byName.length > 1) {
    throw new CliError(t(`"${ref}" matches ${byName.length} crons. Use the id.`, `"${ref}" coincide con ${byName.length} crons. Usa el id.`), EXIT.USAGE);
  }
  return byName[0] ?? null;
}

async function userCronOrNull(ctx: Ctx, ref: string): Promise<UserCron | null> {
  if (isUserCronId(ref)) return (await resolveUserCron(ctx, ref)) ?? { id: ref } as UserCron;
  return resolveUserCron(ctx, ref);
}

const ACTION_OPTIONS = {
  url: { type: "string", value: "https-url", description: "Call this public https URL on each run" },
  method: { type: "string", value: "GET|POST|PUT|PATCH|DELETE", description: "HTTP method (default GET)" },
  body: { type: "string", value: "json|text", description: "Request body (not with GET)" },
  secret: { type: "string", multiple: true, value: "NAME", description: "Vault secret: a header with --url (default Authorization: Bearer); an env var with --run (repeatable)" },
  "secret-header": { type: "string", value: "header", description: "Header for --secret" },
  agent: { type: "string", value: "id", description: "Send a turn to this fleet agent instead of calling a URL" },
  prompt: { type: "string", value: "text", description: "What the agent is told on each run (with --agent)" },
  run: { type: "string", value: "command", description: "Run this shell command in a throwaway box instead (python, files and secrets included; success = exit 0)" },
  file: { type: "string", multiple: true, value: "local[=remote]", description: "File mounted for --run, next to the command by default (repeatable)" },
  "secret-file": { type: "string", multiple: true, value: "NAME:local[=remote]", description: "Upload a local file as a secret only this cron can read, written at the same ~ path in the box (repeatable; e.g. a .p8)" },
  template: { type: "string", value: "python|node|bun|ubuntu", description: "Box image for --run (default python)" },
  timeout: { type: "string", value: "seconds", description: "Time limit for --run (default 300, max 600)" },
  machine: { type: "string", value: "id|name", description: "Run --run with that machine's config (its env and secrets, e.g. DATABASE_URL), resolved on every run" },
} as const;

/** Ruta en la caja para un archivo local: bajo tu HOME → la misma con `~/`; si no, su nombre. Pura, con test. */
export function remotePathFor(local: string, home = homedir()): string {
  const abs = resolve(local.replace(/^~(?=\/)/, home));
  return abs.startsWith(home + "/") ? `~/${abs.slice(home.length + 1)}` : basename(abs);
}

type ExecFlags = { run?: string; files: string[]; secrets: string[]; secretFiles: string[]; template?: string; timeout?: string; machine?: string };

/**
 * Flags de `--run` → `action` exec + `secretValues`. `read` lee un archivo local (inyectable para
 * el test). Los secretos-archivo se suben como valores acotados a este cron.
 */
export function execFromFlags(f: ExecFlags, read: (p: string) => string, home = homedir()) {
  if (!f.run) return {};
  const expand = (p: string) => resolve(p.replace(/^~(?=\/)/, home));
  const split = (spec: string) => {
    const eq = spec.indexOf("=");
    return eq < 0 ? [spec, undefined] as const : [spec.slice(0, eq), spec.slice(eq + 1)] as const;
  };
  const files = f.files.map((spec) => {
    const [local, remote] = split(spec);
    return { path: remote || basename(expand(local)), content: Buffer.from(read(expand(local)), "utf8").toString("base64"), encoding: "base64" as const };
  });
  const secretValues: Record<string, string> = {};
  const secrets: { name: string; file?: string }[] = f.secrets.map((name) => ({ name }));
  for (const spec of f.secretFiles) {
    const colon = spec.indexOf(":");
    if (colon < 1) return { error: `--secret-file needs NAME:path, got "${spec}"` } as const;
    const name = spec.slice(0, colon);
    const [local, remote] = split(spec.slice(colon + 1));
    secretValues[name] = read(expand(local));
    secrets.push({ name, file: remote || remotePathFor(local, home) });
  }
  if (f.timeout != null && !/^\d+$/.test(f.timeout)) return { error: "--timeout must be whole seconds" } as const;
  return {
    action: {
      type: "exec" as const,
      command: f.run,
      ...(files.length ? { files } : {}),
      ...(secrets.length ? { secrets } : {}),
      ...(f.template ? { template: f.template } : {}),
      ...(f.timeout ? { timeoutSeconds: Number(f.timeout) } : {}),
      ...(f.machine ? { machine: f.machine } : {}),
    },
    ...(Object.keys(secretValues).length ? { secretValues } : {}),
  };
}

/** Flags → `action` de la API (o undefined si no vino ninguna). Puro, con test. */
export function actionFromFlags(f: { url?: string; method?: string; body?: string; secret?: string; secretHeader?: string; agent?: string; prompt?: string }) {
  if (f.url && f.agent) return { error: "--url and --agent are exclusive" } as const;
  if (f.url) {
    return {
      action: {
        type: "http" as const,
        url: f.url,
        method: (f.method ?? "GET").toUpperCase(),
        ...(f.body ? { body: f.body } : {}),
        ...(f.secret ? { secretName: f.secret, ...(f.secretHeader ? { secretHeader: f.secretHeader } : {}) } : {}),
      },
    };
  }
  if (f.agent) {
    if (!f.prompt) return { error: "--agent needs --prompt" } as const;
    return { action: { type: "agent_turn" as const, fleetAgentId: f.agent, prompt: f.prompt } };
  }
  return {};
}

const NOTIFY_OPTIONS = {
  notify: { type: "string", value: "push,email,inbox:<name>|none", description: "Tell you after each run: push to the Ghosty app (vault secret GHOSTY_PUSH_TOKEN), email to your account and/or an event in one of your inboxes; none removes it" },
  "notify-on": { type: "string", value: "failure|always", description: "When to notify (default failure)" },
} as const;

/** Flags de aviso → `notify` de la API (undefined = no tocar, null = quitar). Puro, con test. */
export function notifyFromFlags(f: { notify?: string; notifyOn?: string }) {
  if (f.notify == null) return f.notifyOn ? ({ error: "--notify-on needs --notify" } as const) : {};
  if (f.notify === "none") return { notify: null };
  const chans = f.notify.split(",").map((x) => x.trim()).filter(Boolean);
  const inboxChan = chans.find((x) => x.startsWith("inbox:"));
  const bad = chans.find((x) => x !== "push" && x !== "email" && !x.startsWith("inbox:"));
  if (bad || !chans.length || inboxChan === "inbox:") return { error: `--notify takes push, email, inbox:<name> or none (got "${f.notify}")` } as const;
  if (f.notifyOn && f.notifyOn !== "failure" && f.notifyOn !== "always") return { error: "--notify-on is failure or always" } as const;
  return {
    notify: {
      on: (f.notifyOn ?? "failure") as "failure" | "always",
      ...(chans.includes("push") ? { push: true as const } : {}),
      ...(chans.includes("email") ? { email: true as const } : {}),
      ...(inboxChan ? { inbox: inboxChan.slice("inbox:".length) } : {}),
    },
  };
}

/** `notify.inbox` puede venir por nombre: la API pide el id. */
async function resolveNotifyInbox<T extends { notify?: { inbox?: string } | null }>(ctx: Ctx, nf: T): Promise<T> {
  const name = nf.notify?.inbox;
  if (!name || /^[a-f0-9]{24}$/.test(name)) return nf;
  const b = await api<{ id: string }>(ctx, "GET", `/inboxes/${encodeURIComponent(name)}`);
  return { ...nf, notify: { ...nf.notify, inbox: b.id } };
}

const WHEN_OPTIONS = {
  at: { type: "string", value: "when", description: 'Run ONCE at this time: ISO ("2026-10-18T23:00", read in --tz) or "23:00" (today)' },
  in: { type: "string", value: "duration", description: "Run ONCE after this long: 10m, 2h, 1h30m, 1d" },
  until: { type: "string", value: "when", description: "A repeating cron stops after this date" },
  times: { type: "string", value: "N", description: "A repeating cron stops after N more runs" },
} as const;

/** Flags de horario → campos de la API. Puro, con test. */
export function scheduleFromFlags(f: { cron?: string; at?: string; in?: string; until?: string; times?: string; tz?: string }) {
  if (f.cron && (f.at || f.in)) return { error: "--cron repeats; --at/--in run once. Pick one." } as const;
  if (f.at && f.in) return { error: "--at and --in are exclusive" } as const;
  if (f.times != null && !/^\d+$/.test(f.times)) return { error: "--times must be a whole number" } as const;
  return {
    fields: {
      ...(f.cron ? { cron: f.cron } : {}),
      ...(f.at ? { at: f.at } : {}),
      ...(f.in ? { in: f.in } : {}),
      ...(f.until ? { until: f.until } : {}),
      ...(f.times != null ? { times: Number(f.times) } : {}),
      ...(f.tz ? { timezone: f.tz } : {}),
    },
  };
}

const whenOf = (ctx: Ctx) => ({
  cron: str(ctx, "cron"),
  at: str(ctx, "at"),
  in: str(ctx, "in"),
  until: str(ctx, "until"),
  times: str(ctx, "times"),
  tz: str(ctx, "tz"),
});

type Preview = { schedule: string; timezone: string; nextRuns: { at: string; local: string }[]; in: string | null };

/** Cuándo corre, para humanos: «próxima 2026-10-18 23:00 (en 12h 54m)». */
const nextLine = (c: Pick<UserCron, "nextRunLocal" | "in" | "timezone">) =>
  c.nextRunLocal ? t(`next ${c.nextRunLocal} ${c.timezone} (in ${c.in})`, `próxima ${c.nextRunLocal} ${c.timezone} (en ${c.in})`) : t("no next run", "sin próxima ejecución");

const flagsOf = (ctx: Ctx) => ({
  url: str(ctx, "url"),
  method: str(ctx, "method"),
  body: str(ctx, "body"),
  secret: list(ctx, "secret")[0],
  secretHeader: str(ctx, "secret-header"),
  agent: str(ctx, "agent"),
  prompt: str(ctx, "prompt"),
});

type ActionResult = { error: string } | { error?: undefined; action?: Record<string, unknown>; secretValues?: Record<string, string> };

/** Acción + secretos de los flags: --url, --agent o --run (exclusivos). */
function actionOf(ctx: Ctx): ActionResult {
  const run = str(ctx, "run");
  if (run && (str(ctx, "url") || str(ctx, "agent"))) return { error: "--run, --url and --agent are exclusive" } as const;
  if (run) {
    return execFromFlags(
      { run, files: list(ctx, "file"), secrets: list(ctx, "secret"), secretFiles: list(ctx, "secret-file"), template: str(ctx, "template"), timeout: str(ctx, "timeout"), machine: str(ctx, "machine") },
      (p) => {
        try {
          return readFileSync(p, "utf8");
        } catch {
          throw new CliError(t(`Can't read ${p}.`, `No se pudo leer ${p}.`), EXIT.USAGE);
        }
      },
    );
  }
  if (list(ctx, "secret").length > 1) return { error: "--url takes one --secret" } as const;
  return actionFromFlags(flagsOf(ctx)) as ActionResult;
}

type RunView = { startedAt: string; finishedAt: string | null; ok: boolean | null; status: number | null; durationMs: number | null; trigger: string; summary: string | null; error?: string | null; exitCode?: number | null; logs?: string | null };

type CronOverview = {
  key: string;
  name: string;
  path: string;
  cron: string;
  schedule: string;
  status: string;
  paused: boolean;
  running: boolean;
  nextRunAt: string | null;
  lastRun: RunView | null;
};

const STATUS: Record<string, [string, string]> = {
  "al-dia": ["up to date", "al día"],
  tarde: ["late", "tarde"],
  fallo: ["failed", "falló"],
  pausado: ["paused", "pausado"],
  nuevo: ["no runs yet", "sin ejecuciones"],
};

/** Estado legible; «corriendo» gana sobre lo demás. Puro para probarlo. */
export function cronStatus(c: Pick<CronOverview, "status" | "running">): string {
  if (c.running) return t("running", "en ejecución");
  const s = STATUS[c.status];
  return s ? t(s[0], s[1]) : c.status;
}

/** Código de salida de `crons wait`: el del comando en exec; si no, 0 ok / 1 falla. Puro, con test. */
export const runExitCode = (r: { ok: boolean | null; exitCode?: number | null }) =>
  r.exitCode != null ? Math.min(Math.max(r.exitCode, 0), 255) : r.ok ? 0 : 1;

/** «10m», «2h», «1h30m», «1d», «45s» → ms. Pura, con test. */
export function parseDurationMs(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!/^(\d+(d|h|m|s))+$/.test(s)) return null;
  let ms = 0;
  for (const [, n, u] of s.matchAll(/(\d+)(d|h|m|s)/g)) ms += Number(n) * ({ d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 } as const)[u as "d"];
  return ms;
}

function duration(ms: number | null | undefined) {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export const crons: Command = {
  name: "crons",
  aliases: ["cron"],
  group: "Account",
  summary: "Your scheduled jobs (call a URL, message an agent or run a command; repeating or once) and, for admins, the platform's",
  synopsis: "crons <ls|get|create|update|rm|run|runs|wait|pause|resume>",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List your crons (or, with --platform, the platform's scheduled jobs)",
      usage: "easybits crons ls [--platform]",
      options: { platform: { type: "boolean", description: "Platform jobs (backups, purges…; platform admins only)" } },
      examples: ["easybits crons ls", "easybits crons ls --json", "easybits crons ls --platform"],
      async run(ctx) {
        if (!bool(ctx, "platform")) {
          const { items } = await api<{ items: UserCron[] }>(ctx, "GET", "/crons");
          emit(ctx, { items }, () =>
            table(
              items.map((c) => ({
                id: c.id,
                name: c.name,
                schedule: c.enabled ? c.schedule : `${c.schedule} (${c.done ? t("done", "terminado") : t("paused", "en pausa")})`,
                does: describeCronAction(c.action),
                last: c.lastRunAt ? `${fmtDate(c.lastRunAt)} ${c.lastOk === false ? t("failed", "falló") : "ok"}` : "—",
                next: c.enabled && c.nextRunLocal ? `${c.nextRunLocal} (${c.in})` : "—",
              })),
              [["id", "ID"], ["name", "NAME"], ["schedule", "SCHEDULE"], ["does", "DOES"], ["last", "LAST RUN"], ["next", "NEXT RUN"]],
              t(
                'No crons. Create one: easybits crons create "Ping" --cron "*/15 * * * *" --url https://example.com/ping',
                'Sin crons. Crea uno: easybits crons create "Ping" --cron "*/15 * * * *" --url https://ejemplo.com/ping',
              ),
            ),
          );
          return;
        }
        const { items } = await api<{ items: CronOverview[] }>(ctx, "GET", "/admin/crons");
        emit(ctx, { items }, () =>
          table(
            items.map((c) => ({
              key: c.key,
              status: cronStatus(c),
              schedule: c.schedule,
              last: c.lastRun ? `${fmtDate(c.lastRun.startedAt)} (${duration(c.lastRun.durationMs)})` : "—",
              next: c.paused ? "—" : fmtDate(c.nextRunAt),
            })),
            [["key", "JOB"], ["status", "STATUS"], ["schedule", "SCHEDULE"], ["last", "LAST RUN"], ["next", "NEXT RUN"]],
          ),
        );
      },
    },
    get: {
      aliases: ["show"],
      summary: "Show one of your crons: what it does, how it notifies you and when it runs (--json: the whole object)",
      usage: "easybits crons get <id|name> [--json]",
      examples: ['easybits crons get "Review 1.0.10"', "easybits crons get 66f0c2a1b2c3d4e5f6a7b8c9 --json"],
      async run(ctx) {
        const ref = need(ctx, 0, "id|name", this.usage);
        const c = await resolveUserCron(ctx, ref);
        if (!c) throw new CliError(t(`You have no cron "${ref}".`, `No tienes un cron "${ref}".`), EXIT.API, "easybits crons ls", "not_found", 404);
        emit(ctx, c, () => {
          for (const line of describeCron(c)) console.log(line);
        });
      },
    },
    runs: {
      summary: "Show the last runs of one of your crons (id or name) or of a platform job, with the full error",
      usage: "easybits crons runs <id|name|job> [--limit N] [--logs]",
      options: {
        limit: { type: "string", value: "N", description: "At most N runs of one of your crons (1-50, default 50)" },
        logs: { type: "boolean", description: "Also print stdout/stderr of --run crons (last 64 KB per run)" },
      },
      examples: ["easybits crons runs 66f0c2a1b2c3d4e5f6a7b8c9", "easybits crons runs \"Review 1.0.10\" --logs", "easybits crons runs backup-machines --json"],
      async run(ctx) {
        const key = need(ctx, 0, "id|name|job", this.usage);
        const mine = await userCronOrNull(ctx, key);
        const withLogs = bool(ctx, "logs");
        const limit = str(ctx, "limit") ?? "50";
        if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 50) throw usageError(t("--limit is 1 to 50.", "--limit va de 1 a 50."), this.usage);
        const path = mine ? `/crons/${mine.id}/runs?limit=${limit}${withLogs ? "&logs=1" : ""}` : `/admin/crons/${encodeURIComponent(key)}/runs`;
        const { items } = await api<{ items: RunView[] }>(ctx, "GET", path);
        emit(ctx, { items }, () => {
          table(
            items.map((r) => ({
              at: fmtDate(r.startedAt),
              ok: r.ok == null ? t("running", "en ejecución") : r.ok ? "ok" : t("failed", "falló"),
              status: r.exitCode != null ? `exit ${r.exitCode}` : (r.status ?? "—"),
              took: duration(r.durationMs),
              trigger: r.trigger,
              summary: (r.error ?? r.summary ?? "").slice(0, 80),
            })),
            [["at", "STARTED"], ["ok", "RESULT"], ["status", "HTTP"], ["took", "TOOK"], ["trigger", "TRIGGER"], ["summary", "SUMMARY"]],
            t("No runs yet.", "Todavía no hay ejecuciones."),
          );
          if (withLogs) {
            const last = items.find((r) => r.logs);
            if (last) console.log(`\n${t("Output", "Salida")} (${fmtDate(last.startedAt)}):\n${last.logs}`);
          }
          const failed = items.find((r) => r.ok === false && r.error);
          if (failed && !withLogs) console.log(`\n${t("Last error", "Último error")} (${fmtDate(failed.startedAt)}):\n${failed.error}`);
        });
      },
    },
    wait: {
      summary: "Wait for the next run of one of your crons to finish and exit with its result (exec: its exit code)",
      usage: "easybits crons wait <id|name> [--timeout 30m] [--json]",
      options: { timeout: { type: "string", value: "duration", description: "Give up after this long (default 30m; 10m, 2h…)" } },
      examples: ['easybits crons wait "Review 1.0.10"', "easybits crons wait 66f0c2a1b2c3d4e5f6a7b8c9 --timeout 2h --json"],
      async run(ctx) {
        const ref = need(ctx, 0, "id|name", this.usage);
        const mine = await resolveUserCron(ctx, ref);
        if (!mine) throw new CliError(t(`You have no cron "${ref}".`, `No tienes un cron "${ref}".`), EXIT.API, "easybits crons ls", "not_found", 404);
        const limitMs = parseDurationMs(str(ctx, "timeout") ?? "30m");
        if (limitMs == null) throw usageError(t("--timeout like 10m, 2h or 1d.", "--timeout como 10m, 2h o 1d."), this.usage);
        const deadline = Date.now() + limitMs;
        let after: string | undefined;
        for (;;) {
          const left = Math.ceil((deadline - Date.now()) / 1000);
          const q = new URLSearchParams({ wait: String(Math.max(1, Math.min(50, left))) });
          if (after) q.set("after", after);
          const r = await api<{ run: (RunView & { id: string }) | null; after: string; running: boolean; nextRunLocal: string | null }>(ctx, "GET", `/crons/${mine.id}/runs/next?${q}`);
          after = r.after;
          if (r.run) {
            const code = runExitCode(r.run);
            emit(ctx, r, () => {
              console.log(`${r.run!.ok ? "✓" : "✗"} «${mine.name}» ${r.run!.exitCode != null ? `exit ${r.run!.exitCode}` : r.run!.ok ? "ok" : t("failed", "falló")} (${duration(r.run!.durationMs)})`);
              if (r.run!.logs) console.log(r.run!.logs);
              else if (r.run!.error) console.log(r.run!.error);
              else if (r.run!.summary) console.log(r.run!.summary);
            });
            process.exitCode = code;
            return;
          }
          if (Date.now() >= deadline) {
            throw new CliError(
              t(`Gave up waiting for «${mine.name}»${r.nextRunLocal ? ` (next run ${r.nextRunLocal})` : ""}.`, `Me cansé de esperar «${mine.name}»${r.nextRunLocal ? ` (próxima ejecución ${r.nextRunLocal})` : ""}.`),
              EXIT.API,
              `easybits crons wait ${mine.id} --timeout 2h`,
              "timeout",
            );
          }
        }
      },
    },
    run: {
      summary: "Run one of your crons or a platform job now, in the background (trigger manual)",
      usage: "easybits crons run <id|name|job>",
      examples: ["easybits crons run 66f0c2a1b2c3d4e5f6a7b8c9", "easybits crons run purge-notifications --json"],
      async run(ctx) {
        const key = need(ctx, 0, "id|name|job", this.usage);
        const mine = await userCronOrNull(ctx, key);
        const r = await api<Record<string, unknown>>(ctx, "POST", mine ? `/crons/${mine.id}/run` : `/admin/crons/${encodeURIComponent(key)}/run`);
        emit(ctx, r, () =>
          console.log(t(`Started ${key}. Follow it with: easybits crons runs ${key}`, `Arrancó ${key}. Síguela con: easybits crons runs ${key}`)),
        );
      },
    },
    pause: {
      summary: "Pause one of your crons or a platform job until you resume it",
      usage: "easybits crons pause <id|name|job>",
      examples: ["easybits crons pause 66f0c2a1b2c3d4e5f6a7b8c9", "easybits crons pause check-hosting"],
      async run(ctx) {
        const key = need(ctx, 0, "id|name|job", this.usage);
        const mine = await userCronOrNull(ctx, key);
        const r = mine
          ? await api<Record<string, unknown>>(ctx, "PATCH", `/crons/${mine.id}`, { enabled: false })
          : await api<Record<string, unknown>>(ctx, "POST", `/admin/crons/${encodeURIComponent(key)}/pause`, { paused: true });
        emit(ctx, r, () => console.log(t(`Paused ${key}.`, `${key} en pausa.`)));
      },
    },
    resume: {
      summary: "Resume one of your crons or a platform job",
      usage: "easybits crons resume <id|name|job>",
      examples: ["easybits crons resume 66f0c2a1b2c3d4e5f6a7b8c9", "easybits crons resume check-hosting"],
      async run(ctx) {
        const key = need(ctx, 0, "id|name|job", this.usage);
        const mine = await userCronOrNull(ctx, key);
        const r = mine
          ? await api<Record<string, unknown>>(ctx, "PATCH", `/crons/${mine.id}`, { enabled: true })
          : await api<Record<string, unknown>>(ctx, "POST", `/admin/crons/${encodeURIComponent(key)}/pause`, { paused: false });
        emit(ctx, r, () => console.log(t(`Resumed ${key}.`, `${key} reanudada.`)));
      },
    },
    create: {
      aliases: ["add"],
      summary: "Create a cron: call a public https URL, send a turn to one of your agents or run a command in a throwaway box, repeating (at most every 5 min) or once",
      usage: 'easybits crons create <name> (--cron "<5 fields>" [--until <when>] [--times N] | --at <when> | --in <duration>) [--tz <IANA>] (--url <https-url> [--method] [--body] [--secret NAME] | --agent <id> --prompt <text> | --run <cmd> [--file f]… [--secret NAME]… [--secret-file NAME:path]… [--template] [--timeout] [--machine id|name]) [--dry-run]',
      options: {
        cron: { type: "string", value: "expr", description: 'Cron of 5 fields, e.g. "30 8 * * *" = daily 8:30' },
        ...WHEN_OPTIONS,
        tz: { type: "string", value: "zone", description: "IANA time zone (default America/Mexico_City)" },
        ...ACTION_OPTIONS,
        ...NOTIFY_OPTIONS,
        "dry-run": { type: "boolean", description: "Validate and show the next 3 runs without creating anything" },
      },
      examples: [
        'easybits crons create "Study reminder" --cron "30 8 * * *" --url https://www.ghosty.studio/api/v2/me/push --method POST --body \'{"title":"Study time"}\' --secret GHOSTY_PUSH_TOKEN',
        'easybits crons create "Ping once" --at 23:00 --url https://example.com/ping --dry-run',
        'easybits crons create "Review 1.0.10" --at 23:00 --run "pip install -q cryptography && python3 asc.py enviar-tienda" --file scripts/asc.py --secret-file ASC_P8:~/.appstoreconnect/private_keys/AuthKey_X.p8 --notify push --notify-on always',
        'easybits crons create "Weekly report" --cron "0 9 * * 1" --times 4 --agent 6a3c046d2cf7d7f4163f739d --prompt "Send me the weekly sales summary"',
      ],
      async run(ctx) {
        const name = need(ctx, 0, "name", this.usage);
        const w = scheduleFromFlags(whenOf(ctx));
        if ("error" in w) throw usageError(w.error!, this.usage);
        if (!w.fields.cron && !w.fields.at && !w.fields.in) throw usageError(t("Missing --cron, --at or --in.", "Falta --cron, --at o --in."), this.usage);
        const a = actionOf(ctx);
        if ("error" in a) throw usageError(a.error!, this.usage);
        if (!a.action) throw usageError(t("Missing --url, --agent or --run.", "Falta --url, --agent o --run."), this.usage);
        const nf0 = notifyFromFlags({ notify: str(ctx, "notify"), notifyOn: str(ctx, "notify-on") });
        if ("error" in nf0) throw usageError(nf0.error!, this.usage);
        const nf = await resolveNotifyInbox(ctx, nf0);
        const body = { name, ...w.fields, action: a.action, ...(a.secretValues ? { secretValues: a.secretValues } : {}), ...nf };
        if (bool(ctx, "dry-run")) {
          const p = await api<Preview>(ctx, "POST", "/crons", { ...body, dryRun: true });
          emit(ctx, p, () => {
            console.log(t(`OK, nothing created. «${name}» — ${p.schedule}`, `Válido, no se creó nada. «${name}» — ${p.schedule}`));
            for (const r of p.nextRuns) console.log(`  ${r.local} ${p.timezone}  (${r.at})`);
            if (p.in) console.log(t(`First run in ${p.in}.`, `La primera se ejecuta en ${p.in}.`));
          });
          return;
        }
        const c = await api<UserCron>(ctx, "POST", "/crons", body);
        emit(ctx, c, () => console.log(t(`Created ${c.id} «${c.name}» — ${c.schedule}; `, `Creado ${c.id} «${c.name}» — ${c.schedule}; `) + nextLine(c)));
      },
    },
    update: {
      aliases: ["edit", "set"],
      summary: "Change one of your crons (only what you pass)",
      usage: 'easybits crons update <id|name> [--name <n>] [--cron "<expr>" | --at <when> | --in <duration>] [--until <when>] [--times N] [--tz <IANA>] [--url … | --agent … --prompt … | --run <cmd> [--file f]… [--secret NAME]…] [--notify push,email,inbox:<name>|none] [--notify-on failure|always]',
      options: {
        name: { type: "string", value: "name", description: "New name" },
        cron: { type: "string", value: "expr", description: "New schedule" },
        ...WHEN_OPTIONS,
        ...NOTIFY_OPTIONS,
        tz: { type: "string", value: "zone", description: "New IANA time zone" },
        ...ACTION_OPTIONS,
      },
      examples: ['easybits crons update 66f0c2a1b2c3d4e5f6a7b8c9 --cron "0 7 * * 1-5"'],
      async run(ctx) {
        const ref = need(ctx, 0, "id|name", this.usage);
        const mine = await resolveUserCron(ctx, ref);
        if (!mine) throw new CliError(t(`You have no cron "${ref}".`, `No tienes un cron "${ref}".`), EXIT.API, "easybits crons ls", "not_found", 404);
        const a = actionOf(ctx);
        if ("error" in a) throw usageError(a.error!, this.usage);
        const w = scheduleFromFlags(whenOf(ctx));
        if ("error" in w) throw usageError(w.error!, this.usage);
        const nf0 = notifyFromFlags({ notify: str(ctx, "notify"), notifyOn: str(ctx, "notify-on") });
        if ("error" in nf0) throw usageError(nf0.error!, this.usage);
        const nf = await resolveNotifyInbox(ctx, nf0);
        const patch = {
          ...nf,
          ...(str(ctx, "name") ? { name: str(ctx, "name") } : {}),
          ...w.fields,
          ...(a.action ? { action: a.action } : {}),
          ...(a.secretValues ? { secretValues: a.secretValues } : {}),
        };
        if (!Object.keys(patch).length) throw usageError(t("Nothing to change.", "No hay nada que cambiar."), this.usage);
        const c = await api<UserCron>(ctx, "PATCH", `/crons/${mine.id}`, patch);
        emit(ctx, c, () => console.log(t(`Updated «${c.name}» — ${c.schedule}; `, `Actualizado «${c.name}» — ${c.schedule}; `) + nextLine(c)));
      },
    },
    rm: {
      aliases: ["remove", "delete"],
      summary: "Delete one of your crons",
      usage: "easybits crons rm <id|name> [--yes]",
      options: { ...YES_OPTION },
      examples: ["easybits crons rm 66f0c2a1b2c3d4e5f6a7b8c9 --yes"],
      async run(ctx) {
        const ref = need(ctx, 0, "id|name", this.usage);
        const mine = await resolveUserCron(ctx, ref);
        if (!mine) throw new CliError(t(`You have no cron "${ref}".`, `No tienes un cron "${ref}".`), EXIT.API, "easybits crons ls", "not_found", 404);
        requireYesIfHeadless(ctx);
        await confirm(ctx, t(`Delete cron «${mine.name}»? It stops running right away.`, `¿Borrar el cron «${mine.name}»? Deja de ejecutarse de inmediato.`));
        const r = await api<Record<string, unknown>>(ctx, "DELETE", `/crons/${mine.id}`);
        emit(ctx, r, () => console.log(t(`Deleted «${mine.name}»`, `Borrado «${mine.name}»`)));
      },
    },
  },
  defaultSub: "ls",
};
