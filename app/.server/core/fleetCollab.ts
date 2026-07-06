// Fleet collab — on-demand Hocuspocus/Yjs box for real-time document co-editing.
// Mirrors fleetRender.ts/fleetVoice.ts: consumes the `collab` service box keyed
// per-owner (one box shared by all the owner's docs). Unlike render/voice, this
// box calls BACK to EasyBits for auth + Yjs-state persistence (see collab-svc
// server.js + the /api/v2/collab/* endpoints), so its spawn injects
// EASYBITS_BASE_URL + COLLAB_SECRET (SERVICE_REGISTRY.collab.env).
//
// The editor (Tiptap Collaboration) connects its HocuspocusProvider to the
// returned ws:// URL, room = landingId, token = the share JWT.
import type { AuthContext } from "../apiAuth";
import { ensureServiceBox, touchServiceBox, ctxForServiceOwner } from "./fleetServiceOperations";

export interface CollabHandle {
  sandboxId: string;
  /** ws:// URL of the owner's Hocuspocus server (for the HocuspocusProvider). */
  wsUrl: string;
}

// Idempotent: spawns/resumes the owner's collab box and returns its ws URL.
// Throws if the box never exposes a usable :9400 URL.
export async function ensureCollabBox(ctx: AuthContext): Promise<CollabHandle> {
  const box = await ensureServiceBox(ctx, "collab");
  if (!box.collabWsUrl) {
    throw new Error("collab box has no ws URL (port 9400 not exposed)");
  }
  await touchServiceBox(box.sandboxId).catch(() => {});
  return { sandboxId: box.sandboxId, wsUrl: box.collabWsUrl };
}

// Igual pero resolviendo el AuthContext desde el ownerId (para loaders/endpoints
// del share que solo tienen el ownerId del documento, no una sesión del owner).
export async function ensureCollabBoxForOwner(ownerId: string): Promise<CollabHandle> {
  const ctx = await ctxForServiceOwner(ownerId);
  return ensureCollabBox(ctx);
}
