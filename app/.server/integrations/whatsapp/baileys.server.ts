// Baileys surface — IN-PROCESS WhatsApp socket(s) for Pools, running inside the
// EasyBits Fly app. One socket per connected pool. Receives GROUP messages,
// routes them to the pool's ephemeral VMs via routeMessage, sends the reply back.
//
// Robustness:
//   - Auth (creds + signal keys) persists in the Pool row (DB), so the socket
//     survives app redeploys/restarts WITHOUT re-scanning the QR.
//   - rehydratePools() reconnects previously-connected pools at first use after
//     a restart (lazy — never at module import, to keep the prerender build safe).
//   - Reconnect is bounded (backoff + cap → "failed", no tight loop) and ALWAYS
//     ends the previous socket before opening a new one (no orphaned handlers /
//     duplicate replies).
//   - ANTI-SPAM: only answers in Pool.enabledGroups (empty = silent everywhere).
import { Boom } from "@hapi/boom";
import makeWASocket, {
  fetchLatestWaWebVersion,
  DisconnectReason,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  BufferJSON,
  Browsers,
  proto,
  type WASocket,
  type AuthenticationState,
} from "@whiskeysockets/baileys";
import { db } from "~/.server/db";
import { routeMessage, PoolAtCapacity } from "~/.server/core/poolOperations";

const MAX_RECONNECT = 5;
const silent: any = { level: "silent", child: () => silent };
for (const m of ["trace", "debug", "info", "warn", "error", "fatal"]) silent[m] = () => {};

type ConnState = { sock: WASocket; attempts: number; connecting: boolean };
const sockets = new Map<string, ConnState>();

function log(poolId: string, msg: string) {
  console.log(`[pool ${poolId}] ${msg}`);
}

type BaileysStatus = "qr_pending" | "connecting" | "connected" | "failed" | "disconnected";
async function setStatus(poolId: string, status: BaileysStatus, extra: Record<string, unknown> = {}) {
  await db.pool
    .update({ where: { id: poolId }, data: { baileys: { status, at: new Date().toISOString(), ...extra } } })
    .catch(() => {});
}

// ── DB-backed Baileys auth (creds + signal keys persisted on the Pool row) ────
const ser = (o: unknown) => JSON.parse(JSON.stringify(o, BufferJSON.replacer));
const de = (o: unknown) => (o == null ? null : JSON.parse(JSON.stringify(o), BufferJSON.reviver));

async function useDBAuthState(poolId: string): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const row = await db.pool.findUnique({ where: { id: poolId }, select: { authCreds: true, authKeys: true } });
  const creds = de(row?.authCreds) ?? initAuthCreds();
  const keys: Record<string, Record<string, unknown>> = de(row?.authKeys) ?? {};

  // Debounce key persistence: during the pairing handshake Baileys fires dozens
  // of keys.set in a burst. Writing the whole blob to Mongo on each one would
  // stall/break the handshake — coalesce into one flush per 600ms instead.
  let flushTimer: NodeJS.Timeout | null = null;
  const flushKeys = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      db.pool.update({ where: { id: poolId }, data: { authKeys: ser(keys) } }).catch(() => {});
    }, 600);
    if (typeof flushTimer.unref === "function") flushTimer.unref();
  };
  const rawKeys = {
    get: (type: string, ids: string[]) => {
      const out: Record<string, unknown> = {};
      for (const id of ids) {
        let v = keys[type]?.[id];
        if (type === "app-state-sync-key" && v) v = proto.Message.AppStateSyncKeyData.fromObject(v as any);
        if (v !== undefined) out[id] = v;
      }
      return out as any;
    },
    set: (data: any) => {
      for (const type in data) {
        keys[type] = keys[type] || {};
        Object.assign(keys[type], data[type]);
      }
      flushKeys();
    },
  };
  const state: AuthenticationState = {
    creds,
    keys: makeCacheableSignalKeyStore(rawKeys as any, silent),
  };
  const saveCreds = () => db.pool.update({ where: { id: poolId }, data: { authCreds: ser(creds) } }).then(() => {});
  return { state, saveCreds };
}

// Start (or restart) the socket for a pool. Idempotent while connecting. Always
// ends a prior socket first. UI polls Pool.baileys for {status, qr}.
export async function connectPool(poolId: string): Promise<void> {
  const existing = sockets.get(poolId);
  if (existing?.connecting) return;
  if (existing) {
    try { existing.sock.ev.removeAllListeners("connection.update"); existing.sock.end(undefined); } catch {}
    sockets.delete(poolId);
  }

  const pool = await db.pool.findUnique({ where: { id: poolId } });
  if (!pool) throw new Error(`pool ${poolId} not found`);

  await setStatus(poolId, "connecting");

  let auth, version;
  try {
    auth = await useDBAuthState(poolId);
    // Network fetch — race a 5s timeout so a hang can't stall the connect
    // (makeWASocket falls back to its bundled version when undefined).
    version = await Promise.race([
      fetchLatestWaWebVersion({}).then((r) => r.version).catch(() => undefined),
      new Promise<undefined>((res) => setTimeout(() => res(undefined), 5000)),
    ]);
  } catch (e) {
    log(poolId, `init failed: ${e}`);
    await setStatus(poolId, "failed", { reason: "init_error" });
    throw e;
  }
  const sock = makeWASocket({
    version,
    auth: auth.state,
    logger: silent,
    printQRInTerminal: false,
    browser: Browsers.macOS("Chrome"),
  });
  sockets.set(poolId, { sock, attempts: existing?.attempts ?? 0, connecting: true });
  sock.ev.on("creds.update", auth.saveCreds);

  sock.ev.on("connection.update", async (u) => {
    const cur = sockets.get(poolId);
    if (u.qr) { log(poolId, "QR ready"); await setStatus(poolId, "qr_pending", { qr: u.qr }); }
    if (u.connection === "open") {
      if (cur) { cur.attempts = 0; cur.connecting = false; }
      log(poolId, "connected");
      await setStatus(poolId, "connected");
    }
    if (u.connection === "close") {
      if (cur) cur.connecting = false;
      const code = (u.lastDisconnect?.error as Boom)?.output?.statusCode;
      // restartRequired (515) is the normal post-pairing handshake — reconnect
      // immediately and don't count it as a failure.
      if (code === DisconnectReason.restartRequired) {
        log(poolId, "restart required → reconnecting");
        setTimeout(() => void connectPool(poolId).catch(() => {}), 500);
        return;
      }
      const loggedOut = code === DisconnectReason.loggedOut;
      const attempts = (cur?.attempts ?? 0) + 1;
      if (loggedOut || attempts > MAX_RECONNECT) {
        sockets.delete(poolId);
        log(poolId, `stopped (${loggedOut ? "logged_out" : "max_reconnect"})`);
        await setStatus(poolId, "failed", { reason: loggedOut ? "logged_out" : "max_reconnect" });
        return; // STOP — no loop
      }
      if (cur) cur.attempts = attempts;
      const backoffMs = Math.min(30_000, 1000 * 2 ** attempts);
      log(poolId, `closed → retry ${attempts}/${MAX_RECONNECT} in ${backoffMs}ms`);
      await setStatus(poolId, "connecting", { attempt: attempts });
      setTimeout(() => void connectPool(poolId).catch(() => {}), backoffMs);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const fresh = await db.pool.findUnique({ where: { id: poolId }, select: { enabledGroups: true } });
    const enabled = new Set(fresh?.enabledGroups ?? []);
    for (const m of messages) {
      const jid = m.key.remoteJid;
      if (!jid || !jid.endsWith("@g.us")) continue; // groups only
      // DISCOVERY (independent of the allowlist): record any group with activity
      // so the UI can surface it to enable — even fromMe and even before sync.
      await recordSeenGroup(poolId, sock, jid);
      if (m.key.fromMe) continue;
      const text = m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? "";
      if (!text.trim()) continue;
      if (!enabled.has(jid)) { log(poolId, `msg in ${jid} ignored (group not enabled)`); continue; }
      log(poolId, `msg in ${jid} from ${m.key.participant ?? "?"}: "${text.slice(0, 40)}"`);
      try {
        const reply = await routeMessage(poolId, { groupId: jid, sender: m.key.participant ?? undefined, text });
        if (reply) { await sock.sendMessage(jid, { text: reply }); log(poolId, `replied in ${jid}`); }
      } catch (e) {
        if (e instanceof PoolAtCapacity) {
          await sock.sendMessage(jid, { text: "Estamos a tope ahora, dame un momento. 🙏" }).catch(() => {});
        }
        log(poolId, `route failed in ${jid}: ${e}`);
      }
    }
  });
}

// Record a group discovered from an inbound message (jid → subject), so the UI
// can offer it to enable even if WhatsApp's metadata sync hasn't listed it yet.
async function recordSeenGroup(poolId: string, sock: WASocket, jid: string) {
  try {
    const row = await db.pool.findUnique({ where: { id: poolId }, select: { seenGroups: true } });
    const seen = (row?.seenGroups as Record<string, string> | null) ?? {};
    if (seen[jid]) return; // already known
    let subject = jid;
    try { subject = (await sock.groupMetadata(jid)).subject || jid; } catch {}
    seen[jid] = subject;
    await db.pool.update({ where: { id: poolId }, data: { seenGroups: seen } });
  } catch {}
}

// List the WhatsApp groups to offer in the UI: the union of (a) groups the
// account participates in (groupFetchAllParticipating, authoritative subjects)
// and (b) groups discovered from inbound messages (seenGroups). Flagged by
// whether the pool currently answers there. Live socket preferred; falls back
// to seenGroups so a group with activity always shows up.
export async function listPoolGroups(
  poolId: string
): Promise<Array<{ id: string; subject: string; enabled: boolean }>> {
  const pool = await db.pool.findUnique({
    where: { id: poolId },
    select: { enabledGroups: true, seenGroups: true },
  });
  const enabled = new Set(pool?.enabledGroups ?? []);
  const merged = new Map<string, string>(); // jid → subject
  const cur = sockets.get(poolId);
  if (cur) {
    try {
      const groups = await cur.sock.groupFetchAllParticipating();
      for (const g of Object.values(groups) as any[]) merged.set(g.id, g.subject || g.id);
    } catch (e) {
      log(poolId, `groupFetch failed: ${e}`);
    }
  }
  for (const [jid, subject] of Object.entries((pool?.seenGroups as Record<string, string>) ?? {})) {
    if (!merged.has(jid)) merged.set(jid, subject);
  }
  return [...merged.entries()]
    .map(([id, subject]) => ({ id, subject, enabled: enabled.has(id) }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

export function isPoolLive(poolId: string): boolean {
  return sockets.has(poolId);
}

export async function disconnectPool(poolId: string): Promise<void> {
  const cur = sockets.get(poolId);
  if (cur) {
    try { cur.sock.ev.removeAllListeners("connection.update"); cur.sock.end(undefined); } catch {}
    sockets.delete(poolId);
  }
  await setStatus(poolId, "disconnected");
}

// ── Boot rehydration (lazy singleton) ────────────────────────────────────────
// After an app restart the in-process sockets are gone but the DB still says
// "connected" and the creds are persisted. Reconnect them on first use. Runs
// once per process; never at module import (prerender safety).
let rehydrated = false;
let rehydrating: Promise<void> | null = null;
export function ensureRehydrated(): Promise<void> {
  if (rehydrated) return Promise.resolve();
  if (rehydrating) return rehydrating;
  rehydrating = (async () => {
    try {
      const pools = await db.pool.findMany({ where: { authCreds: { not: null } } });
      for (const p of pools) {
        const status = (p.baileys as { status?: string } | null)?.status;
        if ((status === "connected" || status === "connecting") && !sockets.has(p.id)) {
          log(p.id, "rehydrating after restart");
          await connectPool(p.id).catch((e) => log(p.id, `rehydrate failed: ${e}`));
        }
      }
    } finally {
      rehydrated = true;
      startReaper();
    }
  })();
  return rehydrating;
}

// ── Idle reaper (lazy singleton) ─────────────────────────────────────────────
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
