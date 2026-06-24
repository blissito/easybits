// Baileys surface — IN-PROCESS WhatsApp socket(s) for Pools, running inside the
// EasyBits Fly app. One socket per connected pool. Receives GROUP messages,
// routes them to the pool's ephemeral VMs via routeMessage, and sends the reply
// back to the group.
//
// Anti-loop guards (we've been burned before): reconnection uses exponential
// backoff with a hard attempt cap; on logout or cap-exhaustion we set the pool's
// baileys state to "failed" and STOP — never a tight reconnect loop. Init is
// LAZY (connectPool is called from an HTTP route, never at module import) so the
// Docker prerender build can't trip on it.
import { Boom } from "@hapi/boom";
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";
import path from "node:path";
import os from "node:os";
import { db } from "~/.server/db";
import { routeMessage, PoolAtCapacity } from "~/.server/core/poolOperations";

const MAX_RECONNECT = 5;
const AUTH_DIR = process.env.BAILEYS_DIR || path.join(os.tmpdir(), "easybits-baileys");

// Baileys needs a logger with a .child(); we want it silent.
const silent: any = { level: "silent", child: () => silent };
for (const m of ["trace", "debug", "info", "warn", "error", "fatal"]) silent[m] = () => {};

type ConnState = { sock: WASocket; attempts: number; connecting: boolean };
const sockets = new Map<string, ConnState>();

type BaileysStatus = "qr_pending" | "connecting" | "connected" | "failed" | "disconnected";
async function setStatus(poolId: string, status: BaileysStatus, extra: Record<string, unknown> = {}) {
  await db.pool
    .update({ where: { id: poolId }, data: { baileys: { status, at: new Date().toISOString(), ...extra } } })
    .catch(() => {}); // pool may have been deleted; never throw from the socket loop
}

// Start (or restart) the socket for a pool. Idempotent: a second call while a
// socket is live is a no-op. Returns immediately; pairing/connection is async —
// the UI polls Pool.baileys for {status, qr}.
export async function connectPool(poolId: string): Promise<void> {
  const existing = sockets.get(poolId);
  if (existing && existing.connecting) return;

  const pool = await db.pool.findUnique({ where: { id: poolId } });
  if (!pool) throw new Error(`pool ${poolId} not found`);

  // Reflect "connecting" synchronously so the UI starts polling immediately —
  // the QR arrives a beat later via connection.update, and without this the
  // status would stay "disconnected" and polling would never kick in.
  await setStatus(poolId, "connecting");
  startReaper(); // lazy singleton — first connected pool arms the idle reaper

  let state, saveCreds, version;
  try {
    ({ state, saveCreds } = await useMultiFileAuthState(path.join(AUTH_DIR, poolId)));
    ({ version } = await fetchLatestBaileysVersion());
  } catch (e) {
    console.error(`baileys ${poolId} init failed:`, e);
    await setStatus(poolId, "failed", { reason: "init_error", detail: String(e) });
    throw e;
  }
  const sock = makeWASocket({
    version,
    auth: state,
    logger: silent,
    browser: ["EasyBits Pool", "Chrome", "1.0"],
  });
  sockets.set(poolId, { sock, attempts: existing?.attempts ?? 0, connecting: true });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u) => {
    const cur = sockets.get(poolId);
    if (u.qr) await setStatus(poolId, "qr_pending", { qr: u.qr });
    if (u.connection === "open") {
      if (cur) { cur.attempts = 0; cur.connecting = false; }
      await setStatus(poolId, "connected");
    }
    if (u.connection === "close") {
      if (cur) cur.connecting = false;
      const code = (u.lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      const attempts = (cur?.attempts ?? 0) + 1;
      if (loggedOut || attempts > MAX_RECONNECT) {
        sockets.delete(poolId);
        await setStatus(poolId, "failed", { reason: loggedOut ? "logged_out" : "max_reconnect" });
        return; // STOP — no loop
      }
      if (cur) cur.attempts = attempts;
      const backoffMs = Math.min(30_000, 1000 * 2 ** attempts); // 2s,4s,8s,16s,30s
      await setStatus(poolId, "connecting", { attempt: attempts });
      setTimeout(() => void connectPool(poolId).catch(() => {}), backoffMs);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    // ANTI-SPAM: reload the allowlist per batch; only enabled groups get answered.
    const fresh = await db.pool.findUnique({ where: { id: poolId }, select: { enabledGroups: true } });
    const enabled = new Set(fresh?.enabledGroups ?? []);
    for (const m of messages) {
      const jid = m.key.remoteJid;
      if (!jid || m.key.fromMe || !jid.endsWith("@g.us")) continue; // groups only
      if (!enabled.has(jid)) continue; // group not activated → ignore (no spam)
      const text =
        m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? "";
      if (!text.trim()) continue;
      const sender = m.key.participant ?? undefined;
      try {
        const reply = await routeMessage(poolId, { groupId: jid, sender, text });
        if (reply) await sock.sendMessage(jid, { text: reply });
      } catch (e) {
        const msg =
          e instanceof PoolAtCapacity
            ? "Estamos a tope ahora mismo, dame un momento y te respondo. 🙏"
            : null;
        if (msg) await sock.sendMessage(jid, { text: msg }).catch(() => {});
        console.error(`baileys ${poolId} route failed:`, e);
      }
    }
  });
}

// List the WhatsApp groups the connected account participates in, flagged with
// whether the pool currently answers there (Pool.enabledGroups). Needs a live
// socket (returns [] if the pool isn't connected in this process).
export async function listPoolGroups(
  poolId: string
): Promise<Array<{ id: string; subject: string; enabled: boolean }>> {
  const cur = sockets.get(poolId);
  if (!cur) return [];
  const pool = await db.pool.findUnique({ where: { id: poolId }, select: { enabledGroups: true } });
  const enabled = new Set(pool?.enabledGroups ?? []);
  try {
    const groups = await cur.sock.groupFetchAllParticipating();
    return Object.values(groups)
      .map((g: any) => ({ id: g.id as string, subject: (g.subject as string) || g.id, enabled: enabled.has(g.id) }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  } catch (e) {
    console.error(`baileys ${poolId} groupFetch failed:`, e);
    return [];
  }
}

export async function disconnectPool(poolId: string): Promise<void> {
  const cur = sockets.get(poolId);
  if (cur) {
    try { cur.sock.end(undefined); } catch {}
    sockets.delete(poolId);
  }
  await setStatus(poolId, "disconnected");
}

// ── Idle reaper (lazy singleton) ─────────────────────────────────────────────
// Co-located with the socket layer so it shares the same lazy-init lifecycle.
// Suspends pool VMs idle past Pool.idleSuspendMin. Body is fully guarded — a
// failure logs and continues, never throws, never loops tight.
let reaperTimer: NodeJS.Timeout | null = null;
function startReaper() {
  if (reaperTimer) return;
  reaperTimer = setInterval(async () => {
    try {
      const { reapIdlePools } = await import("~/.server/core/poolOperations");
      await reapIdlePools();
    } catch (e) {
      console.error("pool reaper tick failed:", e);
    }
  }, 60_000);
  if (typeof reaperTimer.unref === "function") reaperTimer.unref();
}
