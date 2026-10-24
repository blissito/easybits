/**
 * renderClient — box-primary Chromium render with in-process fallback.
 *
 * The heavy HTML→PDF/PNG render is offloaded to an on-demand `render-svc` fleet
 * box (Chromium, woken from a Firecracker snapshot in ~700ms). Callers build the
 * final HTML exactly as before, then call `renderViaBox(mode, payload, ownerId)`.
 * On ANY failure (box disabled, unreachable, owner missing, timeout) it returns
 * `null` and the caller runs its existing in-process `withPage(...)` block —
 * behavior is identical when the box is down.
 *
 * Ownership mirrors the voice service (fleetVoice.ts): the box is keyed on the
 * resource OWNER (the document owner's userId) and counts against THAT user's
 * sandbox budget — so EVERY render for that owner (documents, presentations,
 * carousels, OG, thumbnails) shares ONE box. Like every catalog service, it's
 * available to all users with NO feature switch: the only gate is whether the
 * box fits in the owner's budget. If it doesn't (plan cap) or the box can't be
 * brought up, ensureServiceBox throws → we render in-process. Ownerless callers
 * (e.g. the public quiz) have no budget to charge → they render in-process too.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { ensureServiceBox, touchServiceBox } from "./fleetServiceOperations";

export interface RenderResult {
  bytes: Buffer;
  /** count of <img> that failed to load and were swapped for a placeholder */
  broken: number;
}

export interface RenderPayload {
  /** Self-contained HTML. WINS over `url` when both are present. */
  html?: string;
  /** Public http/https URL to navigate to. Vetted box-side by assertPublicUrl. */
  url?: string;
  viewport?: { width: number; height: number };
  /**
   * Playwright CONTEXT options (deviceScaleFactor/isMobile/hasTouch/userAgent).
   * They go into newPage() because Playwright can't change them on a live page —
   * which is why a "mobile" capture without this is just a narrow viewport.
   */
  emulate?: Record<string, unknown>;
  /** `url` path only. Box default is "networkidle". */
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  optimizeImages?: boolean;
  waitAssets?: boolean;
  replaceBroken?: boolean;
  /** Extra wait before capture, clamped box-side to 30s. */
  waitMs?: number;
  /** page.pdf() options (format/width/height/landscape/printBackground/margin) */
  pdf?: Record<string, unknown>;
  /** page.screenshot() options (type/clip/fullPage/omitBackground) */
  screenshot?: Record<string, unknown>;
  /** Screenshot: recortar a UN elemento (CSS selector). */
  selector?: string;
  /** Azúcar para `[data-id="…"]` — el mismo id que devuelve /audit. */
  dataId?: string;
  /** Margen en px alrededor del recorte. Default 16 box-side. */
  padding?: number;
}

/**
 * Viewport to audit. The box synthesizes the emulation from these, ignoring the
 * payload's own `viewport`/`emulate`.
 */
export interface AuditViewport {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
}

/** One axe finding. Same shape for `violations` and `incomplete`. */
export interface AxeIssue {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  nodes: {
    target: string[];
    dataId: string | null;
    html: string;
    failureSummary: string;
    data: Record<string, unknown> | null;
  }[];
}

export interface LayoutFinding {
  type: "horizontal-overflow" | "text-clipped" | "overlap" | "missing-viewport-meta";
  severity: "critical" | "serious" | "moderate";
  selector: string;
  dataId: string | null;
  tag: string;
  text: string;
  measured: Record<string, number>;
  /** overlap only: the sibling it collides with. */
  with?: string;
  /** missing-viewport-meta only: the tag to add. */
  fix?: string;
}

export interface AuditResult {
  ok: boolean;
  viewports: {
    name: string;
    width: number;
    height: number;
    deviceScaleFactor?: number;
    isMobile?: boolean;
    axe: {
      ran: boolean;
      error?: string;
      violations: AxeIssue[];
      /** Absent when axe failed to run — hence optional. */
      incomplete?: AxeIssue[];
    };
    layout: {
      hasViewportMeta: boolean;
      documentOverflow: { scrollWidth: number; clientWidth: number; overflowsX: boolean };
      findings: LayoutFinding[];
      truncated: boolean;
    };
  }[];
}

// Background AuthContext for the box owner — render runs in HTTP routes and
// background jobs, not always with a request ctx. Mirrors fleetVoice.ctxFor.
async function ctxFor(ownerId: string): Promise<AuthContext | null> {
  if (!ownerId) return null;
  const user = await db.user.findUnique({ where: { id: ownerId } }).catch(() => null);
  return user ? { user, scopes: ["READ", "WRITE", "DELETE"] } : null;
}

/**
 * Thrown when the box path fails. Carries the HTTP status and route so the
 * message says WHAT broke — a 404 on a route the box doesn't serve is a
 * permanent contract mismatch, not the transient "no bytes" that a retrying
 * agent will bang its head against. That exact ambiguity kept fleetRender.ts
 * broken in production for months.
 */
export class RenderBoxError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly route?: string
  ) {
    super(message);
    this.name = "RenderBoxError";
  }
}

/**
 * Render `payload` on `ctx`'s render box. THROWS on failure — use when the
 * caller has no in-process fallback and must surface why (the MCP render tools).
 * For the fallback path use `renderViaBox`, which swallows this into `null`.
 *
 * This is the ONE place that speaks the box's HTTP contract. Both the fleet MCP
 * tools and the document/presentation/quiz renderers go through here, so there's
 * a single URL shape to keep in sync with the `render-svc` template.
 */
async function postToBox(
  ctx: AuthContext,
  route: string,
  payload: unknown,
  timeoutMs: number
): Promise<{ res: Response; sandboxId: string }> {
  const box = await ensureServiceBox(ctx, "render");
  if (!box.renderUrl) {
    throw new RenderBoxError("render box unavailable (host down or plan cap)");
  }
  const res = await fetch(`${box.renderUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...boxKeyHeader() },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new RenderBoxError(
      `render box returned ${res.status} on ${route}${detail ? `: ${detail}` : ""}`,
      res.status,
      route
    );
  }
  void touchServiceBox(box.sandboxId);
  return { res, sandboxId: box.sandboxId };
}

export async function renderOnBox(
  ctx: AuthContext,
  mode: "pdf" | "screenshot",
  payload: RenderPayload
): Promise<RenderResult> {
  const route = `/render/${mode}`;
  const { res } = await postToBox(ctx, route, payload, 60_000);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) {
    throw new RenderBoxError(`render box returned an empty body on ${route}`, 200, route);
  }
  const broken = parseInt(res.headers.get("x-broken-images") || "0", 10) || 0;
  return { bytes, broken };
}

/**
 * Audit a page's accessibility + layout on the box (axe-core from disk, plus
 * in-page layout measurement, across N viewports IN SERIES). Returns JSON, not
 * bytes — hence a sibling of renderOnBox rather than another `mode`.
 *
 * The timeout is generous because the box runs one fresh browser context per
 * viewport: three viewports is three full page loads.
 */
export async function auditOnBox(
  ctx: AuthContext,
  payload: RenderPayload & { viewports?: AuditViewport[] }
): Promise<AuditResult> {
  const { res } = await postToBox(ctx, "/audit", payload, 180_000);
  const body = (await res.json().catch(() => null)) as AuditResult | null;
  if (!body || !Array.isArray(body.viewports)) {
    throw new RenderBoxError("render box returned an unreadable audit body", 200, "/audit");
  }
  return body;
}

/** Una acción del navegador con estado de la caja (ver render-svc/browserSessions.ts). */
export type BrowserAction =
  | { type: "click"; ref?: string; text?: string }
  | { type: "type"; ref: string; text: string; submit?: boolean }
  | { type: "press"; key: string }
  | { type: "select"; ref: string; value: string }
  | { type: "scroll"; direction?: "down" | "up"; amount?: number }
  | { type: "wait"; ms: number }
  | { type: "goto"; url: string }
  | { type: "back" };

export interface BrowserView {
  sessionId: string;
  url: string;
  title: string;
  /** Elementos con los que se puede interactuar; `ref` vale hasta la siguiente acción. */
  elements: Array<{ ref: string; tag: string; name: string; role?: string; type?: string; href?: string; offscreen?: boolean }>;
  text: string;
  textTruncated: boolean;
  /** JPEG del viewport en base64, sólo si se pidió. */
  screenshot?: string;
  /** Con `fullPage: true`: la página completa en JPEG (tope 6000 px de alto) para el panel, y
   *  cuánto había desplazado el agente, para ubicar el recuadro del clic. Nunca va al modelo. */
  pageShot?: string;
  scrollY?: number;
  viewport?: { width: number; height: number } | null;
  /** act: recuadro del último elemento tocado (px del viewport); null si la acción navegó. */
  target?: { x: number; y: number; width: number; height: number } | null;
  /** act: cuántas acciones corrieron y la que falló (las siguientes no se intentan). */
  done?: number;
  failed?: { index: number; action: BrowserAction; error: string } | null;
}

/** La sesión expiró o la caja se durmió: hay que abrir otra. */
export class BrowserSessionGone extends Error {}

// Muro antibot (captcha, «tráfico inusual», reto de Cloudflare) en lo que vio el navegador.
const BLOCKED_RE =
  /captcha|unusual traffic|tr[áa]fico inusual|are you a robot|eres un robot|verify (that )?you are (a )?human|made by a human|just a moment\.\.\.|attention required|checking your browser|access denied|press (&|and) hold/i;
export const looksBlocked = (v: Pick<BrowserView, "title" | "text">) => BLOCKED_RE.test(`${v.title}\n${(v.text ?? "").slice(0, 3000)}`);

// Llave de las cajas de render (render-svc la exige si la trae en su env). Sin ella, local/dev.
const boxKeyHeader = (): Record<string, string> => (process.env.RENDER_BOX_KEY ? { "x-box-key": process.env.RENDER_BOX_KEY } : {});

/**
 * Pase de «tomar el control»: dueño de la caja + token de la caja + sitio, firmado.
 * `m: "watch"` = pase de sólo mirar: `t` es el id de la sesión del navegador y sólo sirve para
 * la pestaña en vivo (sin clics ni teclas, el agente sigue al mando).
 */
type TakeoverPass = { o: string; t: string; s: string; e: number; m?: "watch" };
const passSecret = () => process.env.RENDER_BOX_KEY || process.env.SECRET || "dev";
const passSig = (body: string) => createHmac("sha256", passSecret()).update(body).digest("base64url");

export function readTakeoverPass(pass: string, siteId: string): TakeoverPass | null {
  const [body, sig] = pass.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(passSig(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as TakeoverPass;
    return p.s === siteId && p.e > Date.now() ? p : null;
  } catch {
    return null;
  }
}

/**
 * «Tomar el control»: la caja entrega un token de un solo dueño, pero la persona NUNCA habla con
 * la caja: recibe URLs de EasyBits con un pase firmado y la app hace de proxy (sites.$id.takeover.$op).
 */
export async function takeoverOnBox(ctx: AuthContext, sessionId: string, siteId: string) {
  const r = await browserOnBox(ctx, "takeover", { sessionId });
  const { token, expiresInMs, viewport } = r as unknown as { token: string; expiresInMs: number; viewport: { width: number; height: number } };
  const body = Buffer.from(JSON.stringify({ o: ctx.user.id, t: token, s: siteId, e: Date.now() + expiresInMs } satisfies TakeoverPass)).toString("base64url");
  const base = `/api/v2/sites/${siteId}/takeover/${body}.${passSig(body)}`;
  return { liveUrl: `${base}/live`, inputUrl: `${base}/input`, releaseUrl: `${base}/release`, viewport, expiresInMs };
}

/** Pase para mirar la pestaña en vivo mientras el agente la maneja. */
export function watchPass(ownerId: string, sessionId: string, siteId: string) {
  const body = Buffer.from(JSON.stringify({ o: ownerId, t: sessionId, s: siteId, e: Date.now() + 10 * 60_000, m: "watch" } satisfies TakeoverPass)).toString("base64url");
  return { liveUrl: `/api/v2/sites/${siteId}/takeover/${body}.${passSig(body)}/live` };
}

/**
 * Proxy a `/browser/watch/live` de la caja. Quien llama ya comprobó que el turno sigue vivo
 * (la caja está despierta). No cuenta como uso: mirar no mantiene viva la caja.
 */
export async function watchOnBox(ctx: AuthContext, sessionId: string, signal?: AbortSignal) {
  const box = await ensureServiceBox(ctx, "render");
  if (!box.renderUrl) throw new RenderBoxError("render box unavailable (host down or plan cap)");
  return fetch(`${box.renderUrl}/browser/watch/live?sessionId=${encodeURIComponent(sessionId)}`, { headers: boxKeyHeader(), signal });
}

/** Proxy de la app a `/browser/human/*` de la caja del dueño. Devuelve la respuesta tal cual (SSE incluido). */
export async function humanOnBox(ctx: AuthContext, op: "live" | "input" | "release", token: string, body?: string, signal?: AbortSignal) {
  const box = await ensureServiceBox(ctx, "render");
  if (!box.renderUrl) throw new RenderBoxError("render box unavailable (host down or plan cap)");
  // La persona manejando cuenta como uso: sin esto el reaper duerme la caja a los 5 min.
  void touchServiceBox(box.sandboxId);
  return fetch(`${box.renderUrl}/browser/human/${op}`, {
    method: op === "live" ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-takeover-token": token, ...boxKeyHeader() },
    body: op === "live" ? undefined : body || "{}",
    signal,
  });
}

/**
 * Navegador con estado en la caja de render del owner: `open` → `act`/`look` → `close`.
 * La página sigue viva entre llamadas (cookies, login) hasta ~3 min sin uso.
 */
export async function browserOnBox(
  ctx: AuthContext,
  op: "open" | "act" | "look" | "close" | "takeover",
  payload: Record<string, unknown>
): Promise<BrowserView> {
  try {
    // act puede encadenar hasta 25 acciones con sus esperas de navegación.
    const { res } = await postToBox(ctx, `/browser/${op}`, payload, op === "act" ? 150_000 : 60_000);
    return (await res.json()) as BrowserView;
  } catch (e) {
    if (e instanceof RenderBoxError && e.status === 409 && e.message.includes("human_in_control")) {
      throw new Error("La persona tomó el control de este navegador. Espera a que te lo devuelva y luego usa browser_look para ver cómo quedó.");
    }
    if (e instanceof RenderBoxError && e.status === 404 && e.message.includes("session_gone")) {
      throw new BrowserSessionGone("La sesión del navegador ya no existe (expiró o la caja se durmió). Abre otra con browser_open.");
    }
    throw e;
  }
}

/**
 * Render `payload` on the owner's render box. Returns the bytes + broken-image
 * count, or `null` if the box path didn't produce a result (→ caller falls back
 * in-process). `ownerId` is the resource owner (document/quiz userId).
 */
export async function renderViaBox(
  mode: "pdf" | "screenshot",
  payload: RenderPayload,
  ownerId: string
): Promise<RenderResult | null> {
  const ctx = await ctxFor(ownerId);
  if (!ctx) return null;
  try {
    return await renderOnBox(ctx, mode, payload);
  } catch (e) {
    console.error("renderViaBox failed, falling back in-process:", (e as Error).message);
    return null;
  }
}
