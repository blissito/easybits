import { db } from "../db";
import { dispatchWebhooks } from "../webhooks";
import {
  extractProgress,
  probeWebProvider,
  WEB_FETCH_TTL_MS,
  type ProbeResult,
} from "../services/providers/brightdata";

const APP_URL = process.env.APP_URL || "https://www.easybits.cloud";

// Un dataset grande (200 registros × varios inputs) puede tardar decenas de minutos; pasado
// esto se da por perdido y se avisa, en vez de dejar al cliente esperando un aviso que no llega.
export const EXTRACT_GIVE_UP_MS = 2 * 60 * 60 * 1000;
const SWEEP_BATCH = 100;
const SWEEP_CONCURRENCY = 8;

async function inBatches<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map((x) => fn(x).catch(() => undefined)));
  }
}

/**
 * Cada minuto (cron `sweep-web-jobs`): pregunta por los extract en curso y avisa por webhook
 * cuando terminan, para que el cliente no tenga que hacer poll. También borra los cuerpos de
 * `web_fetch` guardados para leer por tramos, ya vencidos.
 *
 * El aviso sale UNA vez: el paso `running → ready|error` es un updateMany condicionado, así
 * que dos barridos encimados (o un poll del cliente al mismo tiempo) no lo duplican.
 */
export async function sweepWebJobs(now = new Date()) {
  const running = await db.webJob.findMany({
    where: { kind: "extract", status: "running", providerRef: { not: null } },
    orderBy: { createdAt: "asc" },
    take: SWEEP_BATCH,
  });

  let completed = 0;
  let failed = 0;
  await inBatches(running, SWEEP_CONCURRENCY, async (job) => {
    const tooOld = now.getTime() - job.createdAt.getTime() > EXTRACT_GIVE_UP_MS;
    const prog = await extractProgress(job.providerRef!).catch(() => null);
    if (!prog) {
      if (!tooOld) return; // el proveedor no contestó: se reintenta el siguiente minuto
    } else if (prog.state === "running" && !tooOld) {
      return;
    }

    if (prog?.state === "ready") {
      const claimed = await db.webJob.updateMany({
        where: { id: job.id, status: "running" },
        data: { status: "ready", records: prog.records ?? null, notifiedAt: now },
      });
      if (!claimed.count) return;
      completed++;
      await dispatchWebhooks(job.userId, "web.extract.completed", {
        jobId: job.id,
        source: job.source,
        total: prog.records ?? null,
        url: `${APP_URL}/api/v2/web/extract/${job.id}`,
      });
      return;
    }

    const error = prog?.state === "failed" ? "provider failed" : "timed out";
    const claimed = await db.webJob.updateMany({
      where: { id: job.id, status: "running" },
      data: { status: "error", error, notifiedAt: now },
    });
    if (!claimed.count) return;
    failed++;
    await dispatchWebhooks(job.userId, "web.extract.failed", { jobId: job.id, source: job.source, error });
  });

  // Cuerpos de web_fetch guardados para tramos: se borran a las 24 h. La fila se queda (es
  // el registro de la consulta cobrada); sólo pierde la llave.
  const expired = await db.webJob.findMany({
    where: { kind: "fetch", providerRef: { not: null }, createdAt: { lt: new Date(now.getTime() - WEB_FETCH_TTL_MS) } },
    take: SWEEP_BATCH,
  });
  let purged = 0;
  if (expired.length) {
    const { getPlatformDefaultClient } = await import("../storage");
    const store = getPlatformDefaultClient({ prefix: "web/" });
    await inBatches(expired, SWEEP_CONCURRENCY, async (job) => {
      await store.deleteObject(job.providerRef!);
      await db.webJob.update({ where: { id: job.id }, data: { providerRef: null } });
      purged++;
    });
  }

  const { sweepCrawlJobs } = await import("./webCrawlJobs");
  const crawl = await sweepCrawlJobs(now);
  const { sweepMonitors } = await import("./webMonitors");
  const monitors = await sweepMonitors(now);

  return { checked: running.length, completed, failed, purged, crawl, monitors };
}

/* ── Canario ─────────────────────────────────────────────────────────── */

export const WEB_CANARY_KEY = "web-canary";

export type WebCanaryState = {
  at: string;
  status: "operational" | "degraded" | "down";
  search: ProbeResult;
  fetch: ProbeResult;
  meli: ProbeResult;
  /** Corridas seguidas con alguna sonda fallando. */
  failStreak: number;
};

export function canaryStatus(r: { search: ProbeResult; fetch: ProbeResult; meli: ProbeResult }): WebCanaryState["status"] {
  const bad = [r.search, r.fetch, r.meli].filter((p) => !p.ok).length;
  return bad === 0 ? "operational" : bad === 3 ? "down" : "degraded";
}

export async function readWebCanary(): Promise<WebCanaryState | null> {
  const row = await db.appConfig.findUnique({ where: { key: WEB_CANARY_KEY } });
  return (row?.value as WebCanaryState | undefined) ?? null;
}

/**
 * Cada 15 min (cron `check-web`). Sólo guarda el estado para /status; los avisos por correo
 * se apagaron el 25-oct-2026 a pedido de bliss.
 */
export async function runWebCanary() {
  const prev = await readWebCanary();
  const probes = await probeWebProvider();
  const status = canaryStatus(probes);
  const failStreak = status === "operational" ? 0 : (prev?.failStreak ?? 0) + 1;
  const state: WebCanaryState = { at: new Date().toISOString(), status, ...probes, failStreak };
  await db.appConfig.upsert({
    where: { key: WEB_CANARY_KEY },
    create: { key: WEB_CANARY_KEY, value: state },
    update: { value: state },
  });

  return state;
}
