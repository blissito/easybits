import type { Command } from "../types.js";
import { need } from "../args.js";
import { emit, fmtDate, table } from "../output.js";
import { api } from "../api.js";
import { t } from "../i18n.js";

// Las tareas programadas de la plataforma (respaldos, purgas, caducidad): lo mismo que el panel
// /dash/admin/crons, por la API de admin. Sólo para superusuarios de EasyBits; cualquier otra
// cuenta recibe 403.

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
  summary: "Platform scheduled jobs (admins only): status, history, run now, pause",
  synopsis: "crons <ls|runs|run|pause|resume>",
  subs: {
    ls: {
      aliases: ["list"],
      summary: "List the scheduled jobs with status, schedule, last and next run",
      usage: "easybits crons ls",
      examples: ["easybits crons ls", "easybits crons ls --json"],
      async run(ctx) {
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
      summary: "Show a job's last 50 runs, with the full error when one failed",
      usage: "easybits crons runs <job>",
      examples: ["easybits crons runs backup-machines", "easybits crons runs check-hosting --json"],
      async run(ctx) {
        const key = need(ctx, 0, "job", this.usage);
        const { items } = await api<{ items: RunView[] }>(ctx, "GET", `/admin/crons/${encodeURIComponent(key)}/runs`);
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
      summary: "Run a job now in the background (recorded with trigger manual)",
      usage: "easybits crons run <job>",
      examples: ["easybits crons run purge-notifications", "easybits crons run backup-machines --json"],
      async run(ctx) {
        const key = need(ctx, 0, "job", this.usage);
        const r = await api<Record<string, unknown>>(ctx, "POST", `/admin/crons/${encodeURIComponent(key)}/run`);
        emit(ctx, r, () =>
          console.log(t(`Started ${key}. Follow it with: easybits crons runs ${key}`, `Arrancó ${key}. Síguela con: easybits crons runs ${key}`)),
        );
      },
    },
    pause: {
      summary: "Pause a job: scheduled runs answer skipped until you resume it",
      usage: "easybits crons pause <job>",
      examples: ["easybits crons pause check-hosting"],
      async run(ctx) {
        const key = need(ctx, 0, "job", this.usage);
        const r = await api<Record<string, unknown>>(ctx, "POST", `/admin/crons/${encodeURIComponent(key)}/pause`, { paused: true });
        emit(ctx, r, () => console.log(t(`Paused ${key}.`, `${key} en pausa.`)));
      },
    },
    resume: {
      summary: "Resume a paused job",
      usage: "easybits crons resume <job>",
      examples: ["easybits crons resume check-hosting"],
      async run(ctx) {
        const key = need(ctx, 0, "job", this.usage);
        const r = await api<Record<string, unknown>>(ctx, "POST", `/admin/crons/${encodeURIComponent(key)}/pause`, { paused: false });
        emit(ctx, r, () => console.log(t(`Resumed ${key}.`, `${key} reanudada.`)));
      },
    },
  },
  defaultSub: "ls",
};
