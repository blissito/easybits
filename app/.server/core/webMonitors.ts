import { createHash } from "crypto";
import { db } from "../db";
import { dispatchWebhooks } from "../webhooks";
import { checkWebQuota, chargeWebQueries } from "../webQuota";
import { crawlOnePage } from "../services/providers/brightdata";

// Monitor de cambios: vigila una página cada N minutos y avisa por webhook
// (`web.page.changed`) cuando su contenido principal cambia. Lo avanza el cron
// `sweep-web-jobs` (cada minuto). Cada revisión cuesta 1 consulta.
export const MONITOR_MIN_EVERY = 15;
export const MONITOR_MAX_EVERY = 7 * 24 * 60;
export const MONITORS_PER_USER = 50;
const PER_TICK = 20;
const DIFF_MAX_LINES = 40;
const PREFIX = "web/";

export type MonitorMeta = {
  url: string;
  everyMinutes: number;
  hash?: string;
  checks: number;
  changes: number;
  lastCheckedAt?: string;
  lastChangedAt?: string;
};

const store = () => import("../storage").then((m) => m.getPlatformDefaultClient({ prefix: PREFIX }));
const snapKey = (id: string) => `monitor/${id}.md`;

/**
 * Lo que se compara: el contenido principal en markdown, sin espacios de sobra y sin las
 * líneas que son puro número/fecha/hora, que cambian en cada visita (contadores, «hace 3 min»)
 * y harían saltar el aviso sin que la página haya cambiado de verdad.
 */
const PURE_NUMBER = /^[\d\s:./,\-–]+$/; // 12:34 · 22/10/2026 · 1,234
const RELATIVE_TIME = /^(hace|ago)?\s*\d+\s*(s|seg|segundos?|min|minutos?|h|horas?|d|días?|seconds?|minutes?|hours?|days?)(\s+ago)?$/i;

export function normalizeForCompare(md: string): string {
  return md
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !PURE_NUMBER.test(l) && !RELATIVE_TIME.test(l))
    .join("\n");
}

/** Líneas agregadas y quitadas (por contenido, no por posición). */
export function lineDiff(before: string, after: string) {
  const a = new Set(before.split("\n"));
  const b = new Set(after.split("\n"));
  const added = [...b].filter((l) => !a.has(l));
  const removed = [...a].filter((l) => !b.has(l));
  return {
    added: added.slice(0, DIFF_MAX_LINES),
    removed: removed.slice(0, DIFF_MAX_LINES),
    totalAdded: added.length,
    totalRemoved: removed.length,
  };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createMonitor(userId: string, input: { url: string; everyMinutes?: number }) {
  const url = new URL(input.url).toString();
  const everyMinutes = Math.min(MONITOR_MAX_EVERY, Math.max(MONITOR_MIN_EVERY, Math.floor(input.everyMinutes ?? 60)));
  const active = await db.webJob.count({ where: { userId, kind: "monitor", status: "running" } });
  if (active >= MONITORS_PER_USER) throw new Error(`Máximo ${MONITORS_PER_USER} monitores activos por cuenta`);
  const meta: MonitorMeta = { url, everyMinutes, checks: 0, changes: 0 };
  // La primera revisión (la línea base) corre en la siguiente pasada del cron.
  const job = await db.webJob.create({
    data: { userId, kind: "monitor", source: new URL(url).host, status: "running", charged: true, meta, nextRunAt: new Date() },
  });
  return publicMonitor(job);
}

type MonitorRow = { id: string; status: string; error: string | null; meta: unknown; nextRunAt: Date | null; createdAt: Date };
export function publicMonitor(j: MonitorRow) {
  const m = j.meta as MonitorMeta;
  return {
    monitorId: j.id,
    url: m.url,
    everyMinutes: m.everyMinutes,
    status: j.status === "running" ? "active" : j.status === "error" ? "paused" : "stopped",
    error: j.error ?? undefined,
    checks: m.checks,
    changes: m.changes,
    lastCheckedAt: m.lastCheckedAt ?? null,
    lastChangedAt: m.lastChangedAt ?? null,
    nextCheckAt: j.status === "running" ? j.nextRunAt?.toISOString() ?? null : null,
    createdAt: j.createdAt.toISOString(),
  };
}

export async function listMonitors(userId: string) {
  const rows = await db.webJob.findMany({
    where: { userId, kind: "monitor", status: { in: ["running", "error"] } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(publicMonitor);
}

export async function deleteMonitor(userId: string, id: string) {
  if (!/^[0-9a-f]{24}$/.test(id)) return false;
  const r = await db.webJob.updateMany({
    where: { id, userId, kind: "monitor", status: { in: ["running", "error"] } },
    data: { status: "done", nextRunAt: null },
  });
  if (r.count) await (await store()).deleteObject(snapKey(id)).catch(() => undefined);
  return r.count > 0;
}

/** Una revisión. Exportada para pruebas; en producción la llama `sweepMonitors`. */
export async function checkMonitor(jobId: string, now = new Date()) {
  const job = await db.webJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "running") return { checked: false };
  const meta = job.meta as unknown as MonitorMeta;
  // Reservar el turno ANTES de salir a internet: dos pasadas encimadas no revisan dos veces.
  const next = new Date(now.getTime() + meta.everyMinutes * 60_000);
  const claimed = await db.webJob.updateMany({
    where: { id: job.id, status: "running", nextRunAt: { lte: now } },
    data: { nextRunAt: next },
  });
  if (!claimed.count) return { checked: false };

  const { available } = await checkWebQuota(job.userId);
  if (available < 1) {
    const error = "sin consultas web: compra un pack y vuelve a crear el monitor";
    await db.webJob.update({ where: { id: job.id }, data: { status: "error", error, nextRunAt: null } });
    await dispatchWebhooks(job.userId, "web.monitor.paused", { monitorId: job.id, url: meta.url, error });
    return { checked: false, paused: true };
  }

  const base = new URL(meta.url);
  const got = await crawlOnePage(meta.url, base, { onlyMainContent: true });
  if (!got) return { checked: false, failed: true }; // página caída: se reintenta en el siguiente turno, sin cobro
  await chargeWebQueries(job.userId, { cost: 1, type: "research.brightdata.monitor", resourceId: job.id });

  const current = normalizeForCompare(got.page.markdown);
  const hash = sha(current);
  const s = await store();
  meta.checks++;
  meta.lastCheckedAt = now.toISOString();
  let changed = false;
  if (meta.hash && meta.hash !== hash) {
    const res = await fetch(await s.getReadUrl(snapKey(job.id), 300)).catch(() => null);
    const before = res?.ok ? await res.text() : "";
    const diff = lineDiff(before, current);
    if (diff.totalAdded || diff.totalRemoved) {
      changed = true;
      meta.changes++;
      meta.lastChangedAt = now.toISOString();
      await dispatchWebhooks(job.userId, "web.page.changed", {
        monitorId: job.id,
        url: meta.url,
        changedAt: meta.lastChangedAt,
        ...diff,
      });
    }
  }
  if (!meta.hash || meta.hash !== hash) await s.putObject(snapKey(job.id), Buffer.from(current, "utf8"), "text/markdown; charset=utf-8");
  meta.hash = hash;
  await db.webJob.update({ where: { id: job.id }, data: { meta } });
  return { checked: true, changed };
}

/** Lo llama el cron cada minuto: revisa los monitores a los que ya les toca. */
export async function sweepMonitors(now = new Date()) {
  const due = await db.webJob.findMany({
    where: { kind: "monitor", status: "running", nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: PER_TICK,
    select: { id: true },
  });
  const outs = await Promise.all(
    due.map((d) =>
      checkMonitor(d.id, now).catch((e) => {
        console.error(`[monitor] ${d.id}:`, e instanceof Error ? e.message : e);
        return { checked: false };
      }),
    ),
  );
  return {
    due: due.length,
    checked: outs.filter((o) => o.checked).length,
    changed: outs.filter((o) => "changed" in o && o.changed).length,
  };
}
