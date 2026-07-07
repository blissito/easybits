// Baileys surface — IN-PROCESS WhatsApp socket(s) for Pools, running inside the
// EasyBits Fly app. One socket per connected fleetAgent. Receives GROUP messages,
// routes them to the fleetAgent's ephemeral VMs via routeMessage, sends the reply back.
//
// Robustness:
//   - Auth (creds + signal keys) persists in the FleetAgent row (DB), so the socket
//     survives app redeploys/restarts WITHOUT re-scanning the QR.
//   - rehydratePools() reconnects previously-connected pools at first use after
//     a restart (lazy — never at module import, to keep the prerender build safe).
//   - Reconnect is bounded (backoff + cap → "failed", no tight loop) and ALWAYS
//     ends the previous socket before opening a new one (no orphaned handlers /
//     duplicate replies).
//   - ANTI-SPAM: only answers in FleetAgent.enabledGroups (empty = silent everywhere).
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
import { routeMessage, FleetAgentAtCapacity, FleetAgentRateLimited, ADMIT_GIVEUP_MS, admitRetryDelay } from "~/.server/core/fleetAgentOperations";
import { checkSandboxRateLimit } from "~/.server/rateLimiter";
import { extractInboundContent } from "~/.server/integrations/whatsapp/inboundMedia.server";
import { deliverFilesFromReply } from "~/.server/integrations/whatsapp/outboundMedia.server";
import { wantsVoiceReply, synthesizeVoice } from "~/.server/integrations/whatsapp/whatsappVoice.server";

const MAX_RECONNECT = 5;
// Cooldown so a rate-limited (spamming) group gets the "saturado" notice at most
// once a minute — the notice itself must not become spam. keyed by `${fleetAgentId}:${jid}`.
const NOTICE_COOLDOWN_MS = 60_000;
const lastNoticeAt = new Map<string, number>();
// Cache for listFleetAgentGroups' groupFetchAllParticipating (rate-limited by WhatsApp).
const GROUP_CACHE_MS = 60_000;
const groupListCache = new Map<string, { at: number; groups: Array<[string, string]> }>();
const silent: any = { level: "silent", child: () => silent };
for (const m of ["trace", "debug", "info", "warn", "error", "fatal"]) silent[m] = () => {};

type ConnState = { sock: WASocket; attempts: number; connecting: boolean; pairingPhone?: string; startedAt: number };
const sockets = new Map<string, ConnState>();
// A `connecting` socket that never fires a terminal connection.update (hung
// handshake, or a deploy that killed it mid-pair) would otherwise wedge the guard
// in connectFleetAgent forever → every "Conectar" click silently no-ops. Treat a
// connecting attempt older than this as stale and let a new connect supersede it.
const CONNECTING_STALE_MS = 45_000;

// Last inbound message per (fleetAgentId, jid) — so the worker's `wa` MCP can quote it
// (reply_to_last) and react to it. Keyed `${fleetAgentId}:${jid}`.
const lastIncoming = new Map<string, proto.IWebMessageInfo>();

// IDs of messages WE sent — so our own outbound media (documents/images, which
// carry no assistantName text prefix) isn't re-ingested as a new inbound message
// and looped back to the worker. Same dedup as ghosty-gc's sentIds. Bounded.
const sentMsgIds = new Set<string>();
async function sendTracked(sock: WASocket, jid: string, content: Record<string, unknown>, opts?: Record<string, unknown>) {
  const sent = await sock.sendMessage(jid, content as any, (opts ?? {}) as any);
  const id = sent?.key?.id;
  if (id) {
    sentMsgIds.add(id);
    if (sentMsgIds.size > 400) {
      for (const x of sentMsgIds) { sentMsgIds.delete(x); if (sentMsgIds.size <= 200) break; }
    }
  }
  return sent;
}

function log(fleetAgentId: string, msg: string) {
  console.log(`[fleet ${fleetAgentId}] ${msg}`);
}

// Send a backpressure notice at most once per NOTICE_COOLDOWN_MS per (fleetAgent, jid)
// so the notice itself doesn't become spam. Fire-and-forget.
function sendNoticeOnce(sock: WASocket, fleetAgentId: string, jid: string, text: string) {
  const noticeKey = `${fleetAgentId}:${jid}`;
  const last = lastNoticeAt.get(noticeKey) ?? 0;
  if (Date.now() - last < NOTICE_COOLDOWN_MS) return;
  lastNoticeAt.set(noticeKey, Date.now());
  sock.sendMessage(jid, { text }).catch(() => {});
}

// ── Per-group message coalescing (debounce) ─────────────────────────────────
// WhatsApp users fire several messages in a row before the agent answers. Each
// would otherwise become its own concurrent turn on the SAME sessionId — which
// the Agent SDK can't run in parallel (it stalls) and which produces one reply
// PER message (spam). So we buffer per group, wait a short debounce for the
// burst to settle, then run ONE turn over the combined text → ONE reply. If more
// messages arrive while a turn runs, we re-drain after it (nanoclaw GroupQueue
// pattern, edge-side). In-memory is correct here: single-instance edge, same as
// sentMsgIds/busyVms. Keyed `${fleetAgentId}:${jid}`.
type InboundItem = {
  content: NonNullable<Awaited<ReturnType<typeof extractInboundContent>>>;
  m: proto.IWebMessageInfo;
  sender?: string;
};
// `heldAt`/`attempt`: when a turn fails with FleetAgentAtCapacity we DON'T drop the
// burst — we put it back and retry with backoff (see drainGroup). heldAt>0 marks
// an active capacity hold; the retry timer (not the debounce) drives the drain.
type GroupBuffer = { items: InboundItem[]; timer: ReturnType<typeof setTimeout> | null; running: boolean; heldAt: number; attempt: number };
const groupBuffers = new Map<string, GroupBuffer>();
const COALESCE_DEBOUNCE_MS = 1500;
const MAX_HELD_ITEMS = 20; // cap a group's buffer during a capacity hold
// Set on SIGTERM (deploy/restart). While true we refuse to START new turns so the
// drain can wait for the in-flight ones to finish cleanly. See drainSurface.
let shuttingDown = false;

function enqueueInbound(sock: WASocket, fleetAgentId: string, jid: string, item: InboundItem) {
  const key = `${fleetAgentId}:${jid}`;
  let buf = groupBuffers.get(key);
  if (!buf) { buf = { items: [], timer: null, running: false, heldAt: 0, attempt: 0 }; groupBuffers.set(key, buf); }
  // During a capacity hold, keep coalescing up to a cap but let the backoff retry
  // timer drive the drain — don't reset it to the short debounce.
  if (buf.heldAt > 0) {
    if (buf.items.length < MAX_HELD_ITEMS) buf.items.push(item);
    return;
  }
  buf.items.push(item);
  if (buf.running) return; // a turn is in flight; it re-drains itself on finish
  if (buf.timer) clearTimeout(buf.timer);
  buf.timer = setTimeout(() => { void drainGroup(sock, fleetAgentId, jid); }, COALESCE_DEBOUNCE_MS);
}

// Run ONE coalesced turn over the whole pending burst for a group, then re-drain
// anything that arrived while it ran. FleetAgent meta is re-read so config changes apply.
async function drainGroup(sock: WASocket, fleetAgentId: string, jid: string) {
  const key = `${fleetAgentId}:${jid}`;
  const buf = groupBuffers.get(key);
  // shuttingDown: don't START a new turn during a drain — let the in-flight ones
  // finish. Buffered items wait for the next process (the WA socket re-delivers /
  // ensureRehydrated reconnects); a fresh turn here would just get cut.
  if (!buf || buf.running || buf.items.length === 0 || shuttingDown) return;
  buf.timer = null;
  buf.running = true;
  const batch = buf.items.splice(0); // claim the whole burst

  const fleetAgent = await db.fleetAgent.findUnique({
    where: { id: fleetAgentId },
    select: { hasOwnNumber: true, assistantName: true, ownerId: true, mainGroupJid: true },
  });
  const hasOwnNumber = fleetAgent?.hasOwnNumber ?? false;
  const assistantName = fleetAgent?.assistantName || "Asistente";
  // El grupo MAIN (designado por el dueño en el dashboard) es la superficie ADMIN de
  // Baileys → sus turnos inyectan el MCP admin (self-config, set_agent_prompt). Los
  // demás grupos NO. WABA público nunca es admin (ese gate vive en waba.server).
  const isAdminTurn = !!fleetAgent?.mainGroupJid && jid === fleetAgent.mainGroupJid;
  const ownerId = fleetAgent?.ownerId ?? "";

  const last = batch[batch.length - 1];
  // Combine the burst into one prompt (one person typing several lines, not N
  // requests). Voice intent = any item asked for / sent voice; userText merged.
  const combinedText = batch.map((it) => it.content.text).join("\n");
  const userText = batch.map((it) => it.content.userText).filter(Boolean).join(" ");
  const wasVoice = batch.some((it) => it.content.wasVoice);

  // One 👀 for the WHOLE burst (on the latest message), then typing until done.
  if (last.m.key) sock.sendMessage(jid, { react: { text: "👀", key: last.m.key } }).catch(() => {});
  sock.sendPresenceUpdate("composing", jid).catch(() => {});
  // Typing bubble keep-alive + a ONE-TIME verbal heads-up. 👀 + the bubble already
  // say "te leí y estoy en ello" non-verbally; if the turn runs long (~24s, 3 ticks)
  // we add words once — like nanoclaw's "ahorita lo hago, me toma un momento" — so
  // a heavy task reads as working-on-it, not stuck. Only one filler per turn.
  let typingTicks = 0;
  let sentHeadsUp = false;
  const typingTimer = setInterval(() => {
    sock.sendPresenceUpdate("composing", jid).catch(() => {});
    if (!sentHeadsUp && ++typingTicks >= 3) {
      sentHeadsUp = true;
      const filler = "Estoy en ello, dame un minuto… 🛠️";
      sendTracked(sock, jid, { text: hasOwnNumber ? filler : `${assistantName}: ${filler}` }).catch(() => {});
    }
  }, 8000);
  try {
    const reply = await routeMessage(
      fleetAgentId,
      { groupId: jid, sender: last.sender, text: combinedText, image: batch.map((it) => it.content.image).find(Boolean), admin: isAdminTurn },
      { skipRateLimit: true, hasMedia: batch.some((it) => it.content.hasMedia) }
    );
    if (reply) {
      const delivered = await deliverFilesFromReply((j, c) => sendTracked(sock, j, c), jid, reply);
      let body = delivered.text;
      if (!body && delivered.sent) body = "Ahí te va 👆";
      if (body) {
        const voice = wantsVoiceReply(userText, wasVoice) ? await synthesizeVoice(ownerId, body) : null;
        if (voice) {
          log(fleetAgentId, `[voice] ENVIANDO PTT kokoro bytes=${voice.buffer.length} jid=${jid} onda=${voice.waveform ? "si" : "no"}`);
          await sendTracked(sock, jid, {
            audio: voice.buffer,
            ptt: true,
            mimetype: "audio/ogg; codecs=opus",
            // Box (kokoro) returns a 64-byte PTT waveform (base64) so WhatsApp draws
            // the wave instead of a flat bar; ElevenLabs replies omit it.
            ...(voice.waveform ? { waveform: new Uint8Array(Buffer.from(voice.waveform, "base64")) } : {}),
          });
        } else {
          const out = hasOwnNumber ? body : `${assistantName}: ${body}`;
          await sendTracked(sock, jid, { text: out });
        }
      }
      if (last.m.key) sock.sendMessage(jid, { react: { text: "✅", key: last.m.key } }).catch(() => {});
      log(fleetAgentId, `replied in ${jid} (batch ${batch.length})${delivered.sent ? ` (+${delivered.sent} files)` : ""}`);
    }
    // Turn succeeded (capacity was fine) → clear any capacity hold.
    if (buf.heldAt > 0) {
      log(fleetAgentId, `served in ${jid} after ${Date.now() - buf.heldAt}ms held (${buf.attempt} retries)`);
      buf.heldAt = 0;
      buf.attempt = 0;
    }
  } catch (e) {
    if (e instanceof FleetAgentAtCapacity) {
      // No room right now → HOLD the burst and retry with backoff (don't drop it).
      // The reaper frees RAM within its 60s cadence, so this is normally served
      // well inside the give-up window — the user never has to resend.
      buf.items.unshift(...batch);
      if (buf.heldAt === 0) {
        buf.heldAt = Date.now();
        const notice = "Estamos a tope ahora, dame un momento. 🙏";
        sendNoticeOnce(sock, fleetAgentId, jid, hasOwnNumber ? notice : `${assistantName}: ${notice}`);
      }
      if (Date.now() - buf.heldAt >= ADMIT_GIVEUP_MS) {
        const bye = "Sigo saturado, reintenta en un rato. 🙏";
        sendNoticeOnce(sock, fleetAgentId, jid, hasOwnNumber ? bye : `${assistantName}: ${bye}`);
        log(fleetAgentId, `gave up in ${jid} after ${Date.now() - buf.heldAt}ms`);
        buf.items.length = 0; buf.heldAt = 0; buf.attempt = 0; // drop the hold
      } else {
        log(fleetAgentId, `at capacity in ${jid}, holding (retry ${buf.attempt + 1})`);
      }
    } else {
      // Rate-limit (intentional anti-spam throttle) and any other error → drop,
      // one brief notice. Queuing a rate-limited group would defeat the throttle.
      if (e instanceof FleetAgentRateLimited) {
        const notice = "Voy un poco saturado, dame un momento. 🙏";
        sendNoticeOnce(sock, fleetAgentId, jid, hasOwnNumber ? notice : `${assistantName}: ${notice}`);
      }
      log(fleetAgentId, `route failed in ${jid}: ${e}`);
    }
  } finally {
    clearInterval(typingTimer);
    sock.sendPresenceUpdate("paused", jid).catch(() => {});
    buf.running = false;
    // Next drain: a capacity hold uses the backoff schedule (then bumps the
    // attempt so the NEXT retry waits longer); otherwise the short debounce for
    // messages that landed during the turn.
    if (buf.items.length > 0) {
      if (buf.heldAt > 0) {
        buf.timer = setTimeout(() => { void drainGroup(sock, fleetAgentId, jid); }, admitRetryDelay(buf.attempt));
        buf.attempt++;
      } else {
        buf.timer = setTimeout(() => { void drainGroup(sock, fleetAgentId, jid); }, COALESCE_DEBOUNCE_MS);
      }
    }
  }
}

type BaileysStatus = "qr_pending" | "pairing" | "connecting" | "connected" | "failed" | "disconnected";

// ── Pairing throttle guard (persisted on FleetAgent.baileys) ───────────────────────
// Meta throttles device-link handshakes after ~3 attempts/30min, with a 3-6h
// backoff (documented in nanoclaw). Mashing "Conectar" only deepens it and shows
// the client a bare "Falló". We count pairing fails on the baileys blob (survives
// the frequent surface restarts — in-memory would reset every deploy) and BLOCK
// new attempts during a cooldown, telling the user WHEN to retry instead of
// burning more attempts against Meta.
const PAIR_FAIL_THRESHOLD = 3; // fails within the window → cooldown block
const PAIR_FAIL_WINDOW_MS = 30 * 60_000;
const PAIR_BLOCK_MS = 3 * 60 * 60_000; // 3h (Meta backoff is 3-6h; floor)
const PAIR_KEYS = ["pairFails", "pairFirstFailAt", "pairBlockedUntil"] as const;

function pickPairGuard(b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PAIR_KEYS) if (b[k] !== undefined) out[k] = b[k];
  return out;
}
async function readBaileys(fleetAgentId: string): Promise<Record<string, unknown>> {
  const row = await db.fleetAgent.findUnique({ where: { id: fleetAgentId }, select: { baileys: true } }).catch(() => null);
  return (row?.baileys as Record<string, unknown> | null) ?? {};
}
// ms timestamp if currently throttled (block in the future), else 0.
function pairBlockMs(b: Record<string, unknown>): number {
  const until = b.pairBlockedUntil ? new Date(b.pairBlockedUntil as string).getTime() : 0;
  return until > Date.now() ? until : 0;
}
// Record a failed pairing attempt; once THRESHOLD land within WINDOW, set a block.
async function recordPairFail(fleetAgentId: string): Promise<void> {
  const b = await readBaileys(fleetAgentId);
  const now = Date.now();
  const firstAt = b.pairFirstFailAt ? new Date(b.pairFirstFailAt as string).getTime() : 0;
  const inWindow = firstAt > 0 && now - firstAt < PAIR_FAIL_WINDOW_MS;
  const fails = (inWindow ? ((b.pairFails as number) ?? 0) : 0) + 1;
  const patch: Record<string, unknown> = {
    ...b,
    pairFails: fails,
    pairFirstFailAt: inWindow ? b.pairFirstFailAt : new Date(now).toISOString(),
  };
  if (fails >= PAIR_FAIL_THRESHOLD) patch.pairBlockedUntil = new Date(now + PAIR_BLOCK_MS).toISOString();
  await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { baileys: patch as never } }).catch(() => {});
}

// MERGE the baileys blob so a transient status change (e.g. a reconnect flipping
// to "connecting") doesn't wipe an already-issued pairingCode/qr — the UI keeps
// showing it until we actually connect. Terminal states clear the artifacts, BUT
// failed/disconnected keep the pairing-throttle guard counters (a "failed" must
// not reset the cooldown); a successful "connected" wipes everything (fresh).
async function setStatus(fleetAgentId: string, status: BaileysStatus, extra: Record<string, unknown> = {}) {
  const terminal = status === "connected" || status === "disconnected" || status === "failed";
  const prev =
    ((await db.fleetAgent.findUnique({ where: { id: fleetAgentId }, select: { baileys: true } }).catch(() => null))?.baileys as
      | Record<string, unknown>
      | null) ?? {};
  const cur = !terminal ? prev : status === "connected" ? {} : pickPairGuard(prev);
  const next = { ...cur, status, at: new Date().toISOString(), ...extra };
  await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { baileys: next } }).catch(() => {});
}

// ── DB-backed Baileys auth (creds + signal keys persisted on the FleetAgent row) ────
const ser = (o: unknown) => JSON.parse(JSON.stringify(o, BufferJSON.replacer));
const de = (o: unknown) => (o == null ? null : JSON.parse(JSON.stringify(o), BufferJSON.reviver));

async function useDBAuthState(fleetAgentId: string): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const row = await db.fleetAgent.findUnique({ where: { id: fleetAgentId }, select: { authCreds: true, authKeys: true } });
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
      db.fleetAgent.update({ where: { id: fleetAgentId }, data: { authKeys: ser(keys) } }).catch(() => {});
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
  // Baileys fires creds.update WITHOUT awaiting saveCreds, so an unhandled
  // rejection here crashes the whole app. During a reconnect storm multiple creds
  // writes hit the same FleetAgent doc concurrently → Mongo "write conflict". Retry once,
  // then swallow — losing one creds write is harmless (the next update re-persists).
  const saveCreds = () =>
    db.fleetAgent
      .update({ where: { id: fleetAgentId }, data: { authCreds: ser(creds) } })
      .then(() => {})
      .catch(() =>
        db.fleetAgent
          .update({ where: { id: fleetAgentId }, data: { authCreds: ser(creds) } })
          .then(() => {})
          .catch((e) => console.error(`[fleet ${fleetAgentId}] saveCreds failed:`, e instanceof Error ? e.message : e))
      );
  return { state, saveCreds };
}

// Start (or restart) the socket for a fleetAgent. Idempotent while connecting. Always
// ends a prior socket first. UI polls FleetAgent.baileys for {status, qr}.
export async function connectFleetAgent(fleetAgentId: string, opts: { pairingPhone?: string } = {}): Promise<void> {
  const pairingPhone = opts.pairingPhone?.replace(/[^0-9]/g, "") || undefined;
  const existing = sockets.get(fleetAgentId);
  // Honor an in-flight connect only if it's RECENT — a stale `connecting` (its
  // socket hung / a deploy killed it) must not wedge re-pairing forever.
  if (existing?.connecting && Date.now() - (existing.startedAt ?? 0) < CONNECTING_STALE_MS) return;
  if (existing) {
    try { existing.sock.ev.removeAllListeners("connection.update"); existing.sock.end(undefined); } catch {}
    sockets.delete(fleetAgentId);
  }

  const fleetAgent = await db.fleetAgent.findUnique({ where: { id: fleetAgentId } });
  if (!fleetAgent) throw new Error(`fleetAgent ${fleetAgentId} not found`);

  // Don't burn a Meta attempt on an obviously-bad number (E.164: ~10-15 digits).
  if (pairingPhone && (pairingPhone.length < 10 || pairingPhone.length > 15)) {
    log(fleetAgentId, `invalid pairing number (${pairingPhone.length} digits)`);
    await setStatus(fleetAgentId, "failed", { reason: "invalid_number" });
    return;
  }
  // Throttle guard: if Meta blocked us (>=3 fails/30min), REFUSE new attempts
  // during the cooldown — mashing only deepens it. Tell the UI when to retry.
  const blockedUntil = pairBlockMs((fleetAgent.baileys as Record<string, unknown> | null) ?? {});
  if (blockedUntil) {
    log(fleetAgentId, `pairing blocked until ${new Date(blockedUntil).toISOString()}`);
    await setStatus(fleetAgentId, "failed", { reason: "throttled", until: new Date(blockedUntil).toISOString() });
    return;
  }

  await setStatus(fleetAgentId, "connecting");

  let auth, version;
  try {
    auth = await useDBAuthState(fleetAgentId);
    // Network fetch — race a 5s timeout so a hang can't stall the connect
    // (makeWASocket falls back to its bundled version when undefined).
    version = await Promise.race([
      fetchLatestWaWebVersion({}).then((r) => r.version).catch(() => undefined),
      new Promise<undefined>((res) => setTimeout(() => res(undefined), 5000)),
    ]);
  } catch (e) {
    log(fleetAgentId, `init failed: ${e}`);
    await setStatus(fleetAgentId, "failed", { reason: "init_error" });
    throw e;
  }
  const sock = makeWASocket({
    version,
    auth: auth.state,
    logger: silent,
    printQRInTerminal: false,
    browser: Browsers.macOS("Chrome"),
  });
  sockets.set(fleetAgentId, { sock, attempts: existing?.attempts ?? 0, connecting: true, pairingPhone, startedAt: Date.now() });
  sock.ev.on("creds.update", auth.saveCreds);

  // Pairing-code method: instead of (or alongside) the QR, request an 8-char
  // code the owner types on the phone ("Vincular con número de teléfono"). Only
  // when not already registered. Same device-link mechanism as the QR, so it
  // hits the same WhatsApp throttle — it's an alternative input, not a bypass.
  if (pairingPhone && !auth.state.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(pairingPhone);
        log(fleetAgentId, `pairing code ${code}`);
        await setStatus(fleetAgentId, "pairing", { pairingCode: code, phone: pairingPhone });
      } catch (e) {
        log(fleetAgentId, `requestPairingCode failed: ${e}`);
        await recordPairFail(fleetAgentId);
        await setStatus(fleetAgentId, "failed", { reason: "pairing_code_error" });
      }
    }, 1500);
  }

  sock.ev.on("connection.update", async (u) => {
    const cur = sockets.get(fleetAgentId);
    // In pairing-code mode don't clobber the code with the rotating QR.
    if (u.qr && !pairingPhone) { log(fleetAgentId, "QR ready"); await setStatus(fleetAgentId, "qr_pending", { qr: u.qr }); }
    if (u.connection === "open") {
      if (cur) { cur.attempts = 0; cur.connecting = false; }
      log(fleetAgentId, "connected");
      await setStatus(fleetAgentId, "connected");
    }
    if (u.connection === "close") {
      if (cur) cur.connecting = false;
      const code = (u.lastDisconnect?.error as Boom)?.output?.statusCode;
      // restartRequired (515) is the normal post-pairing handshake — reconnect
      // immediately and don't count it as a failure.
      if (code === DisconnectReason.restartRequired) {
        log(fleetAgentId, "restart required → reconnecting");
        setTimeout(() => void connectFleetAgent(fleetAgentId, { pairingPhone: cur?.pairingPhone }).catch(() => {}), 500);
        return;
      }
      const loggedOut = code === DisconnectReason.loggedOut;
      const attempts = (cur?.attempts ?? 0) + 1;
      if (loggedOut || attempts > MAX_RECONNECT) {
        sockets.delete(fleetAgentId);
        // Dead session: drop the stored creds so the NEXT connect re-pairs fresh.
        // Baileys leaves creds.registered=true after a logout (optimistic false
        // positive set when it generated the pairing code), which would otherwise
        // make the next connect skip requesting a new code (gate at ~L297) and
        // resume a dead session → instant re-logout loop. Only on loggedOut: a
        // max_reconnect is a transient close where the creds may still be valid.
        if (loggedOut) {
          await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { authCreds: null, authKeys: null } }).catch(() => {});
          // Count EVERY logout toward the pairing throttle (not only the pairing-
          // code case): a genuine logout LOOP (Meta rejecting our handshake, or a
          // session that keeps dying) trips the 3/30min block, which STOPS the auto
          // re-pair below — so we can never hammer Meta into a deeper throttle.
          await recordPairFail(fleetAgentId);
          // Clean slate (creds cleared) + NOT throttled → auto re-pair: emit a fresh
          // QR instead of sitting in a dead "Falló". A fresh QR (registered=false)
          // can't resume a dead session, so there's no tight relink loop; and the
          // throttle counter above bounds any pathological one. connectFleetAgent also
          // re-checks the block, so this is safe even under a race.
          if (!pairBlockMs(await readBaileys(fleetAgentId))) {
            log(fleetAgentId, "logged_out → auto re-pairing (fresh QR)");
            await setStatus(fleetAgentId, "connecting", { reason: "relink" });
            setTimeout(() => void connectFleetAgent(fleetAgentId).catch(() => {}), 1000);
            return;
          }
        }
        log(fleetAgentId, `stopped (${loggedOut ? "logged_out" : "max_reconnect"})`);
        await setStatus(fleetAgentId, "failed", { reason: loggedOut ? "logged_out" : "max_reconnect" });
        return; // STOP — no loop
      }
      if (cur) cur.attempts = attempts;
      const backoffMs = Math.min(30_000, 1000 * 2 ** attempts);
      log(fleetAgentId, `closed → retry ${attempts}/${MAX_RECONNECT} in ${backoffMs}ms`);
      await setStatus(fleetAgentId, "connecting", { attempt: attempts });
      setTimeout(() => void connectFleetAgent(fleetAgentId, { pairingPhone: cur?.pairingPhone }).catch(() => {}), backoffMs);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const fresh = await db.fleetAgent.findUnique({
      where: { id: fleetAgentId },
      select: { enabledGroups: true, hasOwnNumber: true, assistantName: true, ownerId: true },
    });
    const enabled = new Set(fresh?.enabledGroups ?? []);
    const hasOwnNumber = fresh?.hasOwnNumber ?? false;
    const assistantName = fresh?.assistantName || "Asistente";
    const ownerId = fresh?.ownerId;
    for (const m of messages) {
      const jid = m.key.remoteJid;
      if (!jid || !jid.endsWith("@g.us")) continue; // groups only
      if (m.key.id && sentMsgIds.has(m.key.id)) continue; // our own outbound media echoed back
      // DISCOVERY (independent of the allowlist): record any group with activity
      // so the UI can surface it to enable — even before WhatsApp's sync.
      await recordSeenGroup(fleetAgentId, sock, jid);
      // Cheap raw text first — for loop-detection + the enable gate, BEFORE any
      // media download (which is slow + costs a Gemini call).
      const rawText = m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? "";
      // Loop prevention WITHOUT blocking the owner (nanoclaw pattern): detect the
      // bot's OWN output and skip only that — not every fromMe.
      //  - hasOwnNumber (dedicated line): fromMe IS the bot → skip fromMe.
      //  - shared/personal number: owner & bot share fromMe, so detect the bot by
      //    the "Nombre:" prefix we stamp on replies → owner's own msgs DO get answered.
      const fromMe = m.key.fromMe || false;
      const isBotMessage = hasOwnNumber ? fromMe : rawText.startsWith(`${assistantName}:`);
      if (isBotMessage) continue;
      if (!enabled.has(jid)) { log(fleetAgentId, `msg in ${jid} ignored (group not enabled)`); continue; }
      if (!ownerId) { log(fleetAgentId, `msg in ${jid} skipped (no ownerId)`); continue; }
      // Rate-limit BEFORE extracting media so a spammy group can't run up Gemini
      // cost. We pass skipRateLimit to routeMessage to avoid double-counting.
      const rl = await checkSandboxRateLimit(`${fleetAgentId}:${jid}`, "op");
      if (!rl.allowed) {
        const notice = "Voy un poco saturado, dame un momento. 🙏";
        sendNoticeOnce(sock, fleetAgentId, jid, hasOwnNumber ? notice : `${assistantName}: ${notice}`);
        log(fleetAgentId, `msg in ${jid} rate limited`);
        continue;
      }
      // Media-aware extraction: turn images/voice/video/docs/location/etc. into the
      // text the worker brain will read. null = nothing actionable (noise) → skip.
      let content;
      try {
        content = await extractInboundContent(sock, m, { ownerId });
      } catch (e) {
        log(fleetAgentId, `media extract failed in ${jid}: ${e}`);
        continue;
      }
      if (!content) continue;
      lastIncoming.set(`${fleetAgentId}:${jid}`, m); // for wa MCP quote/react
      const text = content.text;
      log(fleetAgentId, `msg in ${jid} from ${m.key.participant ?? (fromMe ? "owner" : "?")}: "${text.slice(0, 40)}"`);
      // The turn runs COALESCED after a short debounce (drainGroup): a burst
      // becomes one turn + one reply, with a SINGLE 👀 (on start) + ✅ (on done)
      // reaction emitted there — not one 👀 per message (spammy).
      enqueueInbound(sock, fleetAgentId, jid, { content, m, sender: m.key.participant ?? undefined });
    }
  });
}

// Record a group discovered from an inbound message (jid → subject), so the UI
// can offer it to enable even if WhatsApp's metadata sync hasn't listed it yet.
async function recordSeenGroup(fleetAgentId: string, sock: WASocket, jid: string) {
  try {
    const row = await db.fleetAgent.findUnique({ where: { id: fleetAgentId }, select: { seenGroups: true } });
    const seen = (row?.seenGroups as Record<string, string> | null) ?? {};
    if (seen[jid]) return; // already known
    let subject = jid;
    try { subject = (await sock.groupMetadata(jid)).subject || jid; } catch {}
    seen[jid] = subject;
    await db.fleetAgent.update({ where: { id: fleetAgentId }, data: { seenGroups: seen } });
  } catch {}
}

// List the WhatsApp groups to offer in the UI: the union of (a) groups the
// account participates in (groupFetchAllParticipating, authoritative subjects)
// and (b) groups discovered from inbound messages (seenGroups). Flagged by
// whether the fleetAgent currently answers there. Live socket preferred; falls back
// to seenGroups so a group with activity always shows up.
export async function listFleetAgentGroups(
  fleetAgentId: string,
  opts: { live?: boolean } = {}
): Promise<Array<{ id: string; subject: string; enabled: boolean }>> {
  // live=false (el poll del HUD cada 2.5s) → NUNCA dispara la IQ groupFetch:
  // sirve caché + seenGroups. Solo la carga de página (live=true) refresca en
  // vivo. Sin esto, el poll machaca WhatsApp → rate-overlimit → socket degradado.
  const live = opts.live !== false;
  const fleetAgent = await db.fleetAgent.findUnique({
    where: { id: fleetAgentId },
    select: { enabledGroups: true, seenGroups: true },
  });
  const enabled = new Set(fleetAgent?.enabledGroups ?? []);
  const merged = new Map<string, string>(); // jid → subject
  const cur = sockets.get(fleetAgentId);
  if (cur) {
    // Cache groupFetchAllParticipating: the dashboard polls every ~2.5s and
    // hammering this IQ makes WhatsApp return rate-overlimit (and can degrade the
    // link). One fetch per 60s is plenty — seenGroups covers gaps in between.
    const cached = groupListCache.get(fleetAgentId);
    if (!live) {
      // Poll: jamás tocar el socket. Sirve la última caché (aunque esté vieja);
      // seenGroups (abajo) cubre lo que falte.
      if (cached) for (const [id, subject] of cached.groups) merged.set(id, subject);
    } else if (cached && Date.now() - cached.at < GROUP_CACHE_MS) {
      for (const [id, subject] of cached.groups) merged.set(id, subject);
    } else {
      try {
        const groups = await cur.sock.groupFetchAllParticipating();
        const list: Array<[string, string]> = [];
        for (const g of Object.values(groups) as any[]) list.push([g.id, g.subject || g.id]);
        groupListCache.set(fleetAgentId, { at: Date.now(), groups: list });
        for (const [id, subject] of list) merged.set(id, subject);
      } catch (e) {
        log(fleetAgentId, `groupFetch failed: ${e}`);
        if (cached) for (const [id, subject] of cached.groups) merged.set(id, subject); // serve stale
      }
    }
  }
  for (const [jid, subject] of Object.entries((fleetAgent?.seenGroups as Record<string, string>) ?? {})) {
    if (!merged.has(jid)) merged.set(jid, subject);
  }
  return [...merged.entries()]
    .map(([id, subject]) => ({ id, subject, enabled: enabled.has(id) }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

export function isFleetAgentLive(fleetAgentId: string): boolean {
  return sockets.has(fleetAgentId);
}

// Execute a worker-requested WhatsApp action on the fleetAgent's live socket. Called by
// the /api/v2/fleet-agents/wa-action endpoint after it has authenticated the fleet-agent token,
// resolved sessionId → group, and gated elevated actions by mainGroupJid. `jid`
// is the target group (the session's own group, or another one for main-group
// cross-sends). Mirrors ghosty-gc's WA MCP tools.
export async function executeWaAction(
  fleetAgentId: string,
  jid: string,
  action: string,
  args: Record<string, any>
): Promise<{ ok: boolean; result?: string; error?: string }> {
  // Single-instance assumption: the socket lives in THIS process. If Fly ever runs
  // >1 machine, the worker's wa-action could land on a machine that doesn't hold
  // this fleetAgent's socket → "not connected". Keep Baileys single-instance (see the
  // SCALING CAVEAT in fleetAgentOperations busyVms).
  const cur = sockets.get(fleetAgentId);
  if (!cur) return { ok: false, error: "fleet-agent socket not connected" };
  const sock = cur.sock;
  const last = lastIncoming.get(`${fleetAgentId}:${jid}`);
  try {
    switch (action) {
      case "send_message": {
        const opts = args?.reply_to_last && last ? { quoted: last } : undefined;
        const caption = typeof args?.caption === "string" ? args.caption : undefined;
        if (args?.url) {
          const u = String(args.url);
          // SSRF guard (same as deliverFilesFromReply): the worker is semi-trusted
          // and could be prompt-injected to emit an internal URL.
          if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u)) {
            return { ok: false, error: "blocked url" };
          }
          const resp = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
          if (!resp.ok) return { ok: false, error: `fetch ${resp.status}` };
          const ct = (resp.headers.get("content-type") || "").toLowerCase();
          const buf = Buffer.from(await resp.arrayBuffer());
          if (!buf.length || buf.length > 25 * 1024 * 1024) return { ok: false, error: "file empty or >25MB" };
          if (/^image\//.test(ct)) {
            await sendTracked(sock, jid, { image: buf, caption }, opts);
          } else if (/^audio\//.test(ct)) {
            // Audio → nota de voz REAL (PTT), no documento. Así el agente consume
            // el servicio de voz (voice_tts_create) y la manda como voice note.
            // Sin waveform header aquí → Baileys la deriva con audio-decode (dep).
            log(fleetAgentId, `[voice] wa-action: enviando AUDIO como PTT (ct=${ct}, ${buf.length}b)`);
            await sendTracked(sock, jid, { audio: buf, ptt: true, mimetype: ct.split(";")[0] || "audio/ogg" }, opts);
          } else {
            const fileName =
              args.fileName || decodeURIComponent(String(args.url).split("?")[0].split("/").pop() || "archivo");
            await sendTracked(sock, jid, { document: buf, mimetype: ct.split(";")[0] || "application/octet-stream", fileName, caption }, opts);
          }
          return { ok: true, result: "archivo enviado" };
        }
        const txt = String(args?.text ?? "").trim();
        if (!txt) return { ok: false, error: "text or url required" };
        await sendTracked(sock, jid, { text: txt }, opts);
        return { ok: true, result: "mensaje enviado" };
      }
      case "send_poll": {
        const name = String(args?.name ?? "").trim();
        const options = Array.isArray(args?.options) ? args.options.map(String).filter(Boolean) : [];
        if (!name || options.length < 2) return { ok: false, error: "name + at least 2 options required" };
        const selectableCount = Math.max(1, Math.min(Number(args?.selectable_count) || 1, options.length));
        await sendTracked(sock, jid, { poll: { name, values: options, selectableCount } });
        return { ok: true, result: "encuesta enviada" };
      }
      case "react_message": {
        const emoji = String(args?.emoji ?? "").trim();
        if (!emoji || !last) return { ok: false, error: "emoji + a recent message to react to required" };
        await sock.sendMessage(jid, { react: { text: emoji, key: last.key } });
        return { ok: true, result: "reacción enviada" };
      }
      case "send_location": {
        const lat = Number(args?.latitude);
        const lon = Number(args?.longitude);
        if (!isFinite(lat) || !isFinite(lon)) return { ok: false, error: "latitude+longitude required" };
        await sendTracked(sock, jid, {
          location: { degreesLatitude: lat, degreesLongitude: lon, name: args?.name, address: args?.address },
        });
        return { ok: true, result: "ubicación enviada" };
      }
      case "get_invite_link": {
        const code = await sock.groupInviteCode(jid);
        return { ok: true, result: code ? `https://chat.whatsapp.com/${code}` : "no disponible" };
      }
      default:
        return { ok: false, error: `unknown action ${action}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// createFleetAgentGroup: crea un grupo de WhatsApp NUEVO desde el número del fleetAgent y
// devuelve su invite link (chat.whatsapp.com/…). Lo consume el endpoint
// POST /api/v2/fleet-agents/:fleetAgentId/group — denik lo llama para el feature "abre el grupo
// para hablar con el agente". Registra el jid en enabledGroups para que el fleetAgent
// responda ahí. Single-instance (el socket vive en este proceso, ver caveat).
export async function createFleetAgentGroup(
  fleetAgentId: string,
  name: string,
  denikApiKey?: string
): Promise<{ groupJid: string; inviteUrl: string }> {
  const cur = sockets.get(fleetAgentId);
  if (!cur) throw new Error("fleet-agent socket not connected");
  const sock = cur.sock;
  const meta = await sock.groupCreate(name, []); // grupo con solo el número del fleetAgent
  const groupJid = meta.id;
  const code = await sock.groupInviteCode(groupJid);
  if (!code) throw new Error("could not get group invite code");
  // Opt-in: el fleetAgent solo responde en enabledGroups → registrar el grupo nuevo.
  // Y si viene denikApiKey, guardarlo en groupKeys[groupJid] → routeMessage lo
  // inyecta per-mensaje para scopear el MCP a ESE org (aislamiento per-grupo).
  const fleetAgent = await db.fleetAgent.findUnique({
    where: { id: fleetAgentId },
    select: { enabledGroups: true, groupKeys: true },
  });
  const enabled = new Set(fleetAgent?.enabledGroups ?? []);
  enabled.add(groupJid);
  const data: { enabledGroups: string[]; groupKeys?: Record<string, string> } = {
    enabledGroups: [...enabled],
  };
  if (denikApiKey) {
    data.groupKeys = {
      ...((fleetAgent?.groupKeys as Record<string, string> | null) ?? {}),
      [groupJid]: denikApiKey,
    };
  }
  await db.fleetAgent.update({ where: { id: fleetAgentId }, data });
  return { groupJid, inviteUrl: `https://chat.whatsapp.com/${code}` };
}

export async function disconnectFleetAgent(fleetAgentId: string): Promise<void> {
  const cur = sockets.get(fleetAgentId);
  if (cur) {
    try { cur.sock.ev.removeAllListeners("connection.update"); cur.sock.end(undefined); } catch {}
    sockets.delete(fleetAgentId);
  }
  await setStatus(fleetAgentId, "disconnected");
}

// ── Boot rehydration (lazy singleton) ────────────────────────────────────────
// After an app restart the in-process sockets are gone but the DB still says
// "connected" and the creds are persisted. Reconnect them on first use. Runs
// once per process; never at module import (prerender safety).
let rehydrated = false;
let rehydrating: Promise<void> | null = null;
export function ensureRehydrated(): Promise<void> {
  if (rehydrated) return Promise.resolve();
  // Never auto-reconnect prod pools (or run the reaper) from a LOCAL dev server —
  // npm run dev points at the prod DB, so rehydrating here opens a SECOND Baileys
  // socket to the same WhatsApp account as Fly and they fight over the single web
  // session (connect→close flapping), and the local reaper would suspend/destroy
  // prod worker VMs. Explicit connect (the UI button) still works in dev.
  if (process.env.NODE_ENV !== "production") {
    rehydrated = true;
    return Promise.resolve();
  }
  if (rehydrating) return rehydrating;
  rehydrating = (async () => {
    try {
      // Re-establish the socket for any fleetAgent that was mid-flight before the restart
      // — INCLUDING the pairing states (qr_pending/pairing) which have no creds yet:
      // otherwise a deploy mid-pair leaves a DEAD QR the user can't scan. connectFleetAgent
      // resumes when creds exist and emits a fresh QR when they don't. Skip throttled
      // pools (and connectFleetAgent re-checks) so rehydration never feeds a reconnect loop.
      const pools = await db.fleetAgent.findMany({ select: { id: true, baileys: true } });
      for (const p of pools) {
        const b = (p.baileys as Record<string, unknown> | null) ?? {};
        const status = b.status as string | undefined;
        const active = status === "connected" || status === "connecting" || status === "qr_pending" || status === "pairing";
        if (active && !sockets.has(p.id) && !pairBlockMs(b)) {
          log(p.id, `rehydrating after restart (${status})`);
          await connectFleetAgent(p.id).catch((e) => log(p.id, `rehydrate failed: ${e}`));
        }
      }
    } finally {
      rehydrated = true;
      startReaper();
      installDrainHandlers();
    }
  })();
  return rehydrating;
}

// ── Graceful drain on deploy/restart ─────────────────────────────────────────
// Fly sends SIGTERM then SIGKILLs after kill_timeout (set to 30s in fly.toml).
// Without this, in-flight agent turns are cut mid-stream on every deploy (the
// surface + reaper run in this one process). On the signal we stop starting NEW
// turns (`shuttingDown`) and wait for the running ones to finish — each turn's
// durable writes (agent FleetAgentMessage, lastMessageAt) complete BEFORE buf.running
// flips false, so waiting for zero in-flight guarantees nothing is half-written.
// Bounded under kill_timeout so we never delay the SIGKILL. Residual loss: items
// still buffered (sub-second window) + turns longer than the grace — replay from
// FleetAgentMessage is the documented follow-up ([[todo_pool_surface_durability]]).
let drainHandlersInstalled = false;
function installDrainHandlers() {
  if (drainHandlersInstalled) return;
  drainHandlersInstalled = true;
  // Just flip `shuttingDown` (stop starting new turns) and observe the in-flight
  // ones finishing. We deliberately DON'T process.exit(): the kill_timeout window
  // lets in-flight turns AND any HTTP request (e.g. a long document generation)
  // ride out naturally; an early exit would cut those. Fly SIGKILLs at the end.
  const onSignal = (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("surface", `${sig} → draining (no new turns; kill_timeout 30s window)`);
    void drainSurface();
  };
  process.once("SIGTERM", () => onSignal("SIGTERM"));
  process.once("SIGINT", () => onSignal("SIGINT"));
}
async function drainSurface(graceMs = 28_000): Promise<void> {
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    const inFlight = [...groupBuffers.values()].filter((b) => b.running).length;
    if (inFlight === 0) { log("surface", "drain complete — no turns in flight"); return; }
    log("surface", `draining: ${inFlight} turn(s) in flight…`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  log("surface", "drain grace elapsed — remaining turns may be cut by SIGKILL");
}

// ── Idle reaper (lazy singleton) ─────────────────────────────────────────────
let reaperTimer: NodeJS.Timeout | null = null;
function startReaper() {
  if (reaperTimer) return;
  reaperTimer = setInterval(async () => {
    try {
      const { reapIdleFleetAgents } = await import("~/.server/core/fleetAgentOperations");
      await reapIdleFleetAgents();
    } catch (e) {
      console.error("fleet reaper tick failed:", e);
    }
    try {
      // Idle reaper de los call boxes livekit-svc (30min boot / suspende en
      // llamada / 5min post-llamada). Reusa el mismo heartbeat de 60s.
      const { reapIdleStudios } = await import("~/.server/core/studioOperations");
      await reapIdleStudios();
    } catch (e) {
      console.error("studio reaper tick failed:", e);
    }
    try {
      // Idle reaper de las cajas de servicio de flota (voice-svc, etc.):
      // destruye las que llevan >idleMin sin uso. Mismo heartbeat de 60s.
      const { reapIdleServiceBoxes } = await import("~/.server/core/fleetServiceOperations");
      await reapIdleServiceBoxes();
    } catch (e) {
      console.error("service-box reaper tick failed:", e);
    }
    try {
      // Idle reaper de los agentes embed standalone (claude-worker sin fleetAgent,
      // ej. los chatbots de denik). Suspende a los idle → wake-on-message.
      const { reapIdleEmbedAgents } = await import("~/.server/core/embedAgentReaper");
      await reapIdleEmbedAgents();
    } catch (e) {
      console.error("embed-agent reaper tick failed:", e);
    }
  }, 60_000);
  if (typeof reaperTimer.unref === "function") reaperTimer.unref();
}
