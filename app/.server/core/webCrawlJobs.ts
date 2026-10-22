import { db } from "../db";
import { dispatchWebhooks } from "../webhooks";
import { checkWebQuota, chargeWebQueries } from "../webQuota";
import { crawlOnePage, type CrawledPage } from "../services/providers/brightdata";

const APP_URL = process.env.APP_URL || "https://www.easybits.cloud";

// Rastreo grande: el cron `sweep-web-jobs` (cada minuto) avanza un lote por pasada. Las
// páginas se guardan en el bucket en bloques (un bloque = una pasada) y se leen paginadas.
export const CRAWL_JOB_MAX_PAGES = 2000;
const BATCH = 24; // páginas por pasada y job (~1,400 por hora)
const CONCURRENCY = 12;
const LEASE_MS = 90_000; // más que una pasada: dos barridos encimados no avanzan el mismo job
const MAX_SEEN = 20_000; // tope de URLs recordadas (el doc de Mongo no crece sin fin)
const JOBS_PER_TICK = 5;
export const CRAWL_RESULTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PREFIX = "web/";

export type CrawlJobMeta = {
  startUrl: string;
  maxPages: number;
  country?: string;
  onlyMainContent?: boolean;
  queue: string[];
  seen: string[];
  done: number;
  failed: number;
  chunks: number;
};

const store = () => import("../storage").then((m) => m.getPlatformDefaultClient({ prefix: PREFIX }));
const chunkKey = (jobId: string, i: number) => `crawl/${jobId}/${i}.json`;

/** Crea el job con la cola ya sembrada (la URL de inicio + lo que dio el sitemap). */
export async function createCrawlJob(
  userId: string,
  opts: { startUrl: string; maxPages: number; country?: string; onlyMainContent?: boolean; seed: string[] },
) {
  const queue = [...new Set([opts.startUrl, ...opts.seed])];
  const meta: CrawlJobMeta = {
    startUrl: opts.startUrl,
    maxPages: Math.min(CRAWL_JOB_MAX_PAGES, opts.maxPages),
    country: opts.country,
    onlyMainContent: opts.onlyMainContent,
    queue,
    seen: queue.slice(0, MAX_SEEN),
    done: 0,
    failed: 0,
    chunks: 0,
  };
  return db.webJob.create({
    data: { userId, kind: "crawl", source: new URL(opts.startUrl).host, status: "running", charged: true, meta },
  });
}

async function finish(job: { id: string; userId: string }, meta: CrawlJobMeta, status: "done" | "error", error?: string) {
  await db.webJob.update({
    where: { id: job.id },
    data: { status, records: meta.done, error: error ?? null, notifiedAt: new Date(), leaseUntil: null, meta },
  });
  if (status === "done") {
    await dispatchWebhooks(job.userId, "web.crawl.completed", {
      jobId: job.id,
      startUrl: meta.startUrl,
      total: meta.done,
      failed: meta.failed,
      url: `${APP_URL}/api/v2/web/crawl/${job.id}`,
    });
  } else {
    await dispatchWebhooks(job.userId, "web.crawl.failed", {
      jobId: job.id,
      startUrl: meta.startUrl,
      total: meta.done,
      error,
      url: `${APP_URL}/api/v2/web/crawl/${job.id}`,
    });
  }
}

/** Una pasada sobre UN job: lee un lote, guarda el bloque, cobra lo leído y decide si terminó. */
export async function advanceCrawlJob(jobId: string, now = new Date()) {
  // Candado: sólo una pasada a la vez por job (el cron puede encimarse si una pasada tarda).
  const lease = await db.webJob.updateMany({
    where: {
      id: jobId,
      status: "running",
      OR: [{ leaseUntil: { isSet: false } }, { leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: { leaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (!lease.count) return { advanced: 0 };
  const job = await db.webJob.findUnique({ where: { id: jobId } });
  if (!job) return { advanced: 0 };
  const meta = job.meta as unknown as CrawlJobMeta;

  const remaining = meta.maxPages - meta.done;
  if (!meta.queue.length || remaining <= 0) {
    await finish(job, meta, "done");
    return { advanced: 0, finished: true };
  }
  const { available } = await checkWebQuota(job.userId);
  if (available < 1) {
    await finish(job, meta, "error", "sin consultas web: compra un pack y vuelve a lanzar el rastreo");
    return { advanced: 0, finished: true };
  }

  const take = Math.min(BATCH, remaining, available, meta.queue.length);
  const batch = meta.queue.splice(0, take);
  const base = new URL(meta.startUrl);
  const seen = new Set(meta.seen);
  const pages: CrawledPage[] = [];
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    const got = await Promise.all(batch.slice(i, i + CONCURRENCY).map((u) => crawlOnePage(u, base, meta)));
    for (const g of got) {
      if (!g) {
        meta.failed++;
        continue;
      }
      pages.push(g.page);
      for (const link of g.links) {
        if (seen.has(link) || seen.size >= MAX_SEEN) continue;
        seen.add(link);
        meta.queue.push(link);
      }
    }
  }

  if (pages.length) {
    const s = await store();
    await s.putObject(chunkKey(job.id, meta.chunks), Buffer.from(JSON.stringify(pages), "utf8"), "application/json");
    meta.chunks++;
    meta.done += pages.length;
  }
  meta.seen = [...seen];

  // Orden a propósito: primero se guarda el avance y DESPUÉS se cobra. Si algo truena a la
  // mitad, lo peor es dejar de cobrar un lote; nunca releerlo y cobrarlo dos veces.
  const finished = !meta.queue.length || meta.done >= meta.maxPages;
  if (finished) await finish(job, meta, "done");
  else await db.webJob.update({ where: { id: job.id }, data: { meta, records: meta.done, leaseUntil: null } });
  if (pages.length) {
    await chargeWebQueries(job.userId, { cost: pages.length, type: "research.brightdata.crawl", resourceId: job.id });
  }
  return { advanced: pages.length, ...(finished ? { finished: true } : {}) };
}

/** Lo llama el cron cada minuto: avanza los rastreos en curso y borra los resultados vencidos. */
export async function sweepCrawlJobs(now = new Date()) {
  const running = await db.webJob.findMany({
    where: { kind: "crawl", status: "running" },
    orderBy: { updatedAt: "asc" }, // el que lleva más tiempo esperando, primero
    take: JOBS_PER_TICK,
    select: { id: true },
  });
  // En paralelo: una pasada dura lo que el job más lento, no la suma (el cron es cada minuto).
  const outs = await Promise.all(
    running.map((r) =>
      advanceCrawlJob(r.id, now).catch((e) => {
        console.error(`[crawl] job ${r.id}:`, e instanceof Error ? e.message : e);
        return { advanced: 0 };
      }),
    ),
  );
  const pages = outs.reduce((a, o) => a + o.advanced, 0);

  // Resultados de más de 7 días: se borran los bloques; la fila queda como registro de lo cobrado.
  const old = await db.webJob.findMany({
    where: {
      kind: "crawl",
      status: { in: ["done", "error"] },
      // Campo AUSENTE en Mongo no coincide con `null`: hay que pedir las dos cosas.
      OR: [{ providerRef: { isSet: false } }, { providerRef: null }],
      createdAt: { lt: new Date(now.getTime() - CRAWL_RESULTS_TTL_MS) },
    },
    take: 20,
  });
  let purged = 0;
  if (old.length) {
    const s = await store();
    for (const j of old) {
      const meta = j.meta as unknown as CrawlJobMeta | null;
      for (let i = 0; i < (meta?.chunks ?? 0); i++) await s.deleteObject(chunkKey(j.id, i)).catch(() => undefined);
      // providerRef marca «resultados ya borrados» (las filas de crawl no usan snapshot del proveedor).
      await db.webJob.update({ where: { id: j.id }, data: { providerRef: "purged" } });
      purged++;
    }
  }
  return { jobs: running.length, pages, purged };
}

/** Estado + un bloque de páginas. `cursor` = número de bloque (0, 1, 2…). Gratis. */
export async function readCrawlJob(userId: string, jobId: string, cursor = 0) {
  const job = /^[0-9a-f]{24}$/.test(jobId)
    ? await db.webJob.findFirst({ where: { id: jobId, userId, kind: "crawl" } })
    : null;
  if (!job) return null;
  const meta = job.meta as unknown as CrawlJobMeta;
  const base = {
    jobId: job.id,
    status: job.status as "running" | "done" | "error",
    startUrl: meta.startUrl,
    done: meta.done,
    maxPages: meta.maxPages,
    queued: meta.queue.length,
    failed: meta.failed,
    error: job.error ?? undefined,
  };
  if (job.providerRef === "purged") return { ...base, pages: [], nextCursor: null, expired: true };
  const i = Math.max(0, Math.floor(cursor));
  if (i >= meta.chunks) return { ...base, pages: [], nextCursor: null };
  const s = await store();
  const res = await fetch(await s.getReadUrl(chunkKey(job.id, i), 300));
  const pages = res.ok ? ((await res.json()) as CrawledPage[]) : [];
  return { ...base, pages, nextCursor: i + 1 < meta.chunks ? i + 1 : null };
}
