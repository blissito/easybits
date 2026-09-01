// Medición del blog: lo mínimo para saber qué post funcionó y escribir mejor.
//
// Cuatro preguntas y ninguna más: cuántos entraron, cuántos llegaron al final,
// cuánto tiempo real estuvieron leyendo, y de dónde vinieron. Sin usuarios únicos,
// sin embudos, sin cohortes — nada de eso ayuda a decidir el siguiente post.

import { db } from "~/.server/db";
import { listPublishedPosts } from "~/.server/blogPosts";

// ─────────────── Clasificación del origen ───────────────

/**
 * Agrupa el referrer en un puñado de canales accionables. Se guarda ESTO y se tira
 * la URL completa: "vino de Google" es lo que cambia una decisión editorial; el
 * término de búsqueda exacto de una persona concreta, no.
 */
export function bucketSource(referrer: string | null | undefined, selfHost?: string): string {
  const raw = (referrer || "").trim();
  if (!raw) return "directo";

  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "otro";
  }

  // Una navegación interna (del índice a un post) no es un canal: quien la cuente
  // como tráfico se está contando a sí mismo.
  if (selfHost) {
    const self = selfHost.toLowerCase().replace(/^www\./, "").split(":")[0];
    if (host === self || host.endsWith(`.${self}`)) return "directo";
  }

  if (/(^|\.)google\./.test(host) || host === "news.google.com") return "google";
  if (host === "t.co" || host === "x.com" || host === "twitter.com") return "x";
  if (host === "lnkd.in" || host.endsWith("linkedin.com")) return "linkedin";
  if (host.endsWith("reddit.com")) return "reddit";
  if (host === "news.ycombinator.com") return "hn";
  if (host.endsWith("bing.com") || host.endsWith("duckduckgo.com")) return "google";
  return "otro";
}

// ─────────────── Bots ───────────────

// El robots.txt está abierto y el sitemap invita a los rastreadores, así que sin
// este filtro el post más "leído" sería el que más crawlearon. Es una lista corta a
// propósito: cubre lo que genera volumen de verdad y no intenta ser exhaustiva.
const BOT_UA =
  /bot|crawler|spider|crawling|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|curl|wget|python-requests|headless|lighthouse|pingdom|gtmetrix|semrush|ahrefs|dataprovider|screaming frog/i;

export function isBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent || "").trim();
  // Sin user-agent no hay navegador: ninguna persona llega así.
  if (!ua) return true;
  return BOT_UA.test(ua);
}

// ─────────────── Escritura ───────────────

const clamp = (n: unknown, min: number, max: number): number | undefined => {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : NaN;
  if (Number.isNaN(v)) return undefined;
  return Math.min(max, Math.max(min, v));
};

// Un viewId es un uuid del cliente. Se valida la forma para que no se use como
// campo de texto libre.
const VIEW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidViewId(viewId: unknown): viewId is string {
  return typeof viewId === "string" && VIEW_ID.test(viewId);
}

/** ¿El slug corresponde a un post publicado? Evita filas con slugs inventados. */
export async function isKnownSlug(slug: unknown): Promise<boolean> {
  if (typeof slug !== "string" || !slug) return false;
  const posts = await listPublishedPosts();
  return posts.some((p) => p.slug === slug);
}

/**
 * Alta de la lectura, al abrir el post. Fire-and-forget: medir nunca puede tumbar
 * una página que se está leyendo.
 */
export async function recordView(params: {
  viewId: string;
  slug: string;
  lang?: string | null;
  referrer?: string | null;
  selfHost?: string;
}): Promise<void> {
  try {
    await db.postView.create({
      data: {
        viewId: params.viewId,
        slug: params.slug,
        lang: params.lang === "en" ? "en" : "es",
        ts: new Date(),
        source: bucketSource(params.referrer, params.selfHost),
      },
    });
  } catch (error) {
    // Un viewId repetido (StrictMode, doble envío) choca contra el unique: es
    // exactamente lo que queremos que pase, y no es un error que reportar.
    if (!String(error).includes("Unique constraint")) {
      console.error("recordView:", error);
    }
  }
}

/** Cierre de la lectura, desde el beacon de salida. */
export async function updateView(params: {
  viewId: string;
  seconds?: number;
  depth?: number;
  completed?: boolean;
}): Promise<void> {
  try {
    await db.postView.update({
      where: { viewId: params.viewId },
      data: {
        // 2h de tope: por encima de eso no es una lectura, es una pestaña olvidada
        // con la ventana al frente.
        seconds: clamp(params.seconds, 0, 7200),
        depth: clamp(params.depth, 0, 100),
        completed: params.completed === true,
      },
    });
  } catch (error) {
    // Actualizar una fila que no existe (alta perdida, fila ya purgada) no es
    // accionable: se ignora en vez de ensuciar los logs.
    if (!String(error).includes("not found") && !String(error).includes("P2025")) {
      console.error("updateView:", error);
    }
  }
}

// ─────────────── Agregación ───────────────

export interface PostStats {
  slug: string;
  title: string;
  date: string;
  /** Estimación por conteo de palabras, para comparar contra lo medido. */
  readingTimeMin: number;
  views: number;
  /** Lecturas con beacon de cierre. Es la base de las dos métricas siguientes. */
  measured: number;
  completedPct: number | null;
  medianSeconds: number | null;
  topSources: Array<{ source: string; views: number }>;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Agrega en memoria, no con `groupBy`: el repo ya documenta que groupBy revienta en
 * Prisma+MongoDB con campos nullable (ver users.tsx y telemetry.ts), y aquí casi
 * todos lo son. El volumen de un blog cabe de sobra.
 */
export function aggregate(
  rows: Array<{
    slug: string;
    source: string;
    seconds: number | null;
    completed: boolean | null;
  }>,
  posts: Array<{ slug: string; title: string; date: string; readingTime: number }>
): PostStats[] {
  const byPost = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byPost.get(r.slug) ?? [];
    list.push(r);
    byPost.set(r.slug, list);
  }

  const stats: PostStats[] = [];
  for (const [slug, list] of byPost) {
    const post = posts.find((p) => p.slug === slug);
    // Una lectura SIN beacon de cierre es un dato ausente, no un abandono. Meterla
    // como fracaso hundiría el porcentaje y nos haría reescribir posts que en
    // realidad funcionan.
    const closed = list.filter((r) => r.completed !== null);
    const seconds = list.map((r) => r.seconds).filter((s): s is number => typeof s === "number");

    const sources = new Map<string, number>();
    for (const r of list) sources.set(r.source, (sources.get(r.source) ?? 0) + 1);

    stats.push({
      slug,
      title: post?.title ?? slug,
      date: post?.date ?? "",
      readingTimeMin: post?.readingTime ?? 0,
      views: list.length,
      measured: closed.length,
      completedPct: closed.length
        ? Math.round((closed.filter((r) => r.completed).length / closed.length) * 100)
        : null,
      medianSeconds: median(seconds),
      topSources: [...sources.entries()]
        .map(([source, views]) => ({ source, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 3),
    });
  }

  return stats.sort((a, b) => b.views - a.views);
}

/** Lee el rango por el índice [ts] y agrega. */
export async function getPostStats(since: Date): Promise<PostStats[]> {
  const [rows, posts] = await Promise.all([
    db.postView.findMany({
      where: { ts: { gte: since } },
      select: { slug: true, source: true, seconds: true, completed: true },
    }),
    listPublishedPosts(),
  ]);
  return aggregate(rows, posts);
}
