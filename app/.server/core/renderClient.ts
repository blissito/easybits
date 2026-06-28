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
 * resource OWNER (the document/quiz owner's userId), so EVERY render for that
 * owner — documents, presentations, carousels, OG, thumbnails — shares ONE box.
 * This is the fleet-service pattern: a capability available to any of the
 * owner's surfaces, not a per-call or per-group box.
 *
 * Gated by RENDER_SERVICE_ENABLED=1. Ownerless callers (e.g. the public quiz)
 * fall back to RENDER_BOX_OWNER_ID; if that's unset they render in-process.
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
 * Render `payload` on the owner's render box. Returns the bytes + broken-image
 * count, or `null` if the box path didn't produce a result (→ caller falls back
 * in-process). `ownerId` is the resource owner (document/quiz userId).
 */
export async function renderViaBox(
  mode: "pdf" | "screenshot",
  payload: RenderPayload,
  ownerId: string
): Promise<RenderResult | null> {
  if (process.env.RENDER_SERVICE_ENABLED !== "1") return null;
  const ctx = await ctxFor(ownerId || process.env.RENDER_BOX_OWNER_ID || "");
  if (!ctx) return null;
  try {
    const box = await ensureServiceBox(ctx, "render");
    if (!box.renderUrl) return null;
    const res = await fetch(`${box.renderUrl}/render/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    void touchServiceBox(box.sandboxId);
    const bytes = Buffer.from(await res.arrayBuffer());
    const broken = parseInt(res.headers.get("x-broken-images") || "0", 10) || 0;
    return { bytes, broken };
  } catch (e) {
    console.error("renderViaBox failed, falling back in-process:", (e as Error).message);
    return null;
  }
}
