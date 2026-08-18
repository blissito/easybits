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
    headers: { "content-type": "application/json" },
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
