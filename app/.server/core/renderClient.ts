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
  html: string;
  viewport?: { width: number; height: number };
  optimizeImages?: boolean;
  waitAssets?: boolean;
  replaceBroken?: boolean;
  /** Extra wait before capture. NOT honored by the current box build (see fleetRender.BOX_HONORS_WAIT). */
  waitMs?: number;
  /** page.pdf() options (format/width/height/landscape/printBackground/margin) */
  pdf?: Record<string, unknown>;
  /** page.screenshot() options (type/clip/fullPage/omitBackground) */
  screenshot?: Record<string, unknown>;
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
export async function renderOnBox(
  ctx: AuthContext,
  mode: "pdf" | "screenshot",
  payload: RenderPayload
): Promise<RenderResult> {
  const box = await ensureServiceBox(ctx, "render");
  if (!box.renderUrl) {
    throw new RenderBoxError("render box unavailable (host down or plan cap)");
  }
  const route = `/render/${mode}`;
  const res = await fetch(`${box.renderUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
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
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) {
    throw new RenderBoxError(`render box returned an empty body on ${route}`, 200, route);
  }
  const broken = parseInt(res.headers.get("x-broken-images") || "0", 10) || 0;
  return { bytes, broken };
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
