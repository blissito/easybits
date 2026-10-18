import type { Command, Ctx } from "../types.js";
import { bool, need, str } from "../args.js";
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
  kind?: "once" | "recurring";
  cron: string;
  at?: string | null;
  timezone: string;
  schedule: string;
  enabled: boolean;
  done?: boolean;
  nextRunLocal?: string | null;
  in?: string | null;
  action: { type: "http"; method: string; url: string; secretName?: string } | { type: "agent_turn"; fleetAgentId: string; prompt: string };
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
  return `agent ${a.fleetAgentId}: ${a.prompt.length > 40 ? a.prompt.slice(0, 39) + "…" : a.prompt}`;
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
  secret: { type: "string", value: "NAME", description: "Vault secret sent as a header (default Authorization: Bearer)" },
  "secret-header": { type: "string", value: "header", description: "Header for --secret" },
  agent: { type: "string", value: "id", description: "Send a turn to this fleet agent instead of calling a URL" },
  prompt: { type: "string", value: "text", description: "What the agent is told on each run (with --agent)" },
} as const;

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
  c.nextRunLocal ? t(`next ${c.nextRunLocal} ${c.timezone} (in ${c.in})`, `próxima ${c.nextRunLocal} ${c.timezone} (en ${c.in})`) : t("no next run", "sin próxima corrida");

const flagsOf = (ctx: Ctx) => ({
  url: str(ctx, "url"),
  method: str(ctx, "method"),
  body: str(ctx, "body"),
  secret: str(ctx, "secret"),
  secretHeader: str(ctx, "secret-header"),
  agent: str(ctx, "agent"),
  prompt: str(ctx, "prompt"),
});

type RunView = { startedAt: string; finishedAt: string | null; ok: boolean | null; status: number | null; durationMs: number | null; trigger: string; summary: string | null; error?: string | null };

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
  nuevo: ["no runs yet", "sin corridas"],
};

/** Estado legible; «corriendo» gana sobre lo demás. Puro para probarlo. */
export function cronStatus(c: Pick<CronOverview, "status" | "running">): string {
  if (c.running) return t("running", "corriendo");
  const s = STATUS[c.status];
  return s ? t(s[0], s[1]) : c.status;
}

function duration(ms: number | null | undefined) {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export const crons: Command = {
  name: "crons",
  aliases: ["cron"],
  group: "Account",
  summary: "Your scheduled jobs (call a URL or message an agent, repeating or once) and, for admins, the platform's",
  synopsis: "crons <ls|create|update|rm|run|runs|pause|resume>",
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
    runs: {
      summary: "Show the last runs of one of your crons (id or name) or of a platform job, with the full error",
      usage: "easybits crons runs <id|name|job>",
      examples: ["easybits crons runs 66f0c2a1b2c3d4e5f6a7b8c9", "easybits crons runs backup-machines --json"],
      async run(ctx) {
        const key = need(ctx, 0, "id|name|job", this.usage);
        const mine = await userCronOrNull(ctx, key);
        const path = mine ? `/crons/${mine.id}/runs?limit=50` : `/admin/crons/${encodeURIComponent(key)}/runs`;
        const { items } = await api<{ items: RunView[] }>(ctx, "GET", path);
        emit(ctx, { items }, () => {
          table(
            items.map((r) => ({
              at: fmtDate(r.startedAt),
              ok: r.ok == null ? t("running", "corriendo") : r.ok ? "ok" : t("failed", "falló"),
              status: r.status ?? "—",
              took: duration(r.durationMs),
              trigger: r.trigger,
              summary: (r.error ?? r.summary ?? "").slice(0, 80),
            })),
            [["at", "STARTED"], ["ok", "RESULT"], ["status", "HTTP"], ["took", "TOOK"], ["trigger", "TRIGGER"], ["summary", "SUMMARY"]],
            t("No runs yet.", "Todavía no hay corridas."),
          );
          const failed = items.find((r) => r.ok === false && r.error);
          if (failed) console.log(`\n${t("Last error", "Último error")} (${fmtDate(failed.startedAt)}):\n${failed.error}`);
        });
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
      summary: "Create a cron: call a public https URL or send a turn to one of your agents, repeating (at most every 5 min) or once",
      usage: 'easybits crons create <name> (--cron "<5 fields>" [--until <when>] [--times N] | --at <when> | --in <duration>) [--tz <IANA>] (--url <https-url> [--method] [--body] [--secret NAME] | --agent <id> --prompt <text>) [--dry-run]',
      options: {
        cron: { type: "string", value: "expr", description: 'Cron of 5 fields, e.g. "30 8 * * *" = daily 8:30' },
        ...WHEN_OPTIONS,
        tz: { type: "string", value: "zone", description: "IANA time zone (default America/Mexico_City)" },
        ...ACTION_OPTIONS,
        "dry-run": { type: "boolean", description: "Validate and show the next 3 runs without creating anything" },
      },
      examples: [
        'easybits crons create "Study reminder" --cron "30 8 * * *" --url https://www.ghosty.studio/api/v2/me/push --method POST --body \'{"title":"Study time"}\' --secret GHOSTY_PUSH_TOKEN',
        'easybits crons create "Ping once" --at 23:00 --url https://example.com/ping --dry-run',
        'easybits crons create "Weekly report" --cron "0 9 * * 1" --times 4 --agent 6a3c046d2cf7d7f4163f739d --prompt "Send me the weekly sales summary"',
      ],
      async run(ctx) {
        const name = need(ctx, 0, "name", this.usage);
        const w = scheduleFromFlags(whenOf(ctx));
        if ("error" in w) throw usageError(w.error!, this.usage);
        if (!w.fields.cron && !w.fields.at && !w.fields.in) throw usageError(t("Missing --cron, --at or --in.", "Falta --cron, --at o --in."), this.usage);
        const a = actionFromFlags(flagsOf(ctx));
        if ("error" in a) throw usageError(a.error!, this.usage);
        if (!a.action) throw usageError(t("Missing --url or --agent.", "Falta --url o --agent."), this.usage);
        const body = { name, ...w.fields, action: a.action };
        if (bool(ctx, "dry-run")) {
          const p = await api<Preview>(ctx, "POST", "/crons", { ...body, dryRun: true });
          emit(ctx, p, () => {
            console.log(t(`OK, nothing created. «${name}» — ${p.schedule}`, `Válido, no se creó nada. «${name}» — ${p.schedule}`));
            for (const r of p.nextRuns) console.log(`  ${r.local} ${p.timezone}  (${r.at})`);
            if (p.in) console.log(t(`First run in ${p.in}.`, `La primera corre en ${p.in}.`));
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
      usage: 'easybits crons update <id|name> [--name <n>] [--cron "<expr>" | --at <when> | --in <duration>] [--until <when>] [--times N] [--tz <IANA>] [--url … | --agent … --prompt …]',
      options: {
        name: { type: "string", value: "name", description: "New name" },
        cron: { type: "string", value: "expr", description: "New schedule" },
        ...WHEN_OPTIONS,
        tz: { type: "string", value: "zone", description: "New IANA time zone" },
        ...ACTION_OPTIONS,
      },
      examples: ['easybits crons update 66f0c2a1b2c3d4e5f6a7b8c9 --cron "0 7 * * 1-5"'],
      async run(ctx) {
        const ref = need(ctx, 0, "id|name", this.usage);
        const mine = await resolveUserCron(ctx, ref);
        if (!mine) throw new CliError(t(`You have no cron "${ref}".`, `No tienes un cron "${ref}".`), EXIT.API, "easybits crons ls", "not_found", 404);
        const a = actionFromFlags(flagsOf(ctx));
        if ("error" in a) throw usageError(a.error!, this.usage);
        const w = scheduleFromFlags(whenOf(ctx));
        if ("error" in w) throw usageError(w.error!, this.usage);
        const patch = {
          ...(str(ctx, "name") ? { name: str(ctx, "name") } : {}),
          ...w.fields,
          ...(a.action ? { action: a.action } : {}),
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
        await confirm(ctx, t(`Delete cron «${mine.name}»? It stops running right away.`, `¿Borrar el cron «${mine.name}»? Deja de correr de inmediato.`));
        const r = await api<Record<string, unknown>>(ctx, "DELETE", `/crons/${mine.id}`);
        emit(ctx, r, () => console.log(t(`Deleted «${mine.name}»`, `Borrado «${mine.name}»`)));
      },
    },
  },
  defaultSub: "ls",
};
