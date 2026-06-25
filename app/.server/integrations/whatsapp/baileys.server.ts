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
import { routeMessage, PoolAtCapacity, PoolRateLimited } from "~/.server/core/poolOperations";
import { checkSandboxRateLimit } from "~/.server/rateLimiter";
import { extractInboundContent } from "~/.server/integrations/whatsapp/inboundMedia.server";
import { deliverFilesFromReply } from "~/.server/integrations/whatsapp/outboundMedia.server";
import { wantsVoiceReply, synthesizeVoiceOgg } from "~/.server/integrations/whatsapp/whatsappVoice.server";

const MAX_RECONNECT = 5;
// Cooldown so a rate-limited (spamming) group gets the "saturado" notice at most
// once a minute — the notice itself must not become spam. keyed by `${poolId}:${jid}`.
const NOTICE_COOLDOWN_MS = 60_000;
const lastNoticeAt = new Map<string, number>();
// Cache for listPoolGroups' groupFetchAllParticipating (rate-limited by WhatsApp).
const GROUP_CACHE_MS = 60_000;
const groupListCache = new Map<string, { at: number; groups: Array<[string, string]> }>();
const silent: any = { level: "silent", child: () => silent };
for (const m of ["trace", "debug", "info", "warn", "error", "fatal"]) silent[m] = () => {};

type ConnState = { sock: WASocket; attempts: number; connecting: boolean; pairingPhone?: string };
const sockets = new Map<string, ConnState>();

// Last inbound message per (poolId, jid) — so the worker's `wa` MCP can quote it
// (reply_to_last) and react to it. Keyed `${poolId}:${jid}`.
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

function log(poolId: string, msg: string) {
  console.log(`[pool ${poolId}] ${msg}`);
}

// Send a backpressure notice at most once per NOTICE_COOLDOWN_MS per (pool, jid)
// so the notice itself doesn't become spam. Fire-and-forget.
function sendNoticeOnce(sock: WASocket, poolId: string, jid: string, text: string) {
  const noticeKey = `${poolId}:${jid}`;
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
// sentMsgIds/busyVms. Keyed `${poolId}:${jid}`.
type InboundItem = {
  content: NonNullable<Awaited<ReturnType<typeof extractInboundContent>>>;
  m: proto.IWebMessageInfo;
  sender?: string;
};
type GroupBuffer = { items: InboundItem[]; timer: ReturnType<typeof setTimeout> | null; running: boolean };
const groupBuffers = new Map<string, GroupBuffer>();
const COALESCE_DEBOUNCE_MS = 1500;

function enqueueInbound(sock: WASocket, poolId: string, jid: string, item: InboundItem) {
  const key = `${poolId}:${jid}`;
  let buf = groupBuffers.get(key);
  if (!buf) { buf = { items: [], timer: null, running: false }; groupBuffers.set(key, buf); }
  buf.items.push(item);
  if (buf.running) return; // a turn is in flight; it re-drains itself on finish
  if (buf.timer) clearTimeout(buf.timer);
  buf.timer = setTimeout(() => { void drainGroup(sock, poolId, jid); }, COALESCE_DEBOUNCE_MS);
}

// Run ONE coalesced turn over the whole pending burst for a group, then re-drain
// anything that arrived while it ran. Pool meta is re-read so config changes apply.
async function drainGroup(sock: WASocket, poolId: string, jid: string) {
  const key = `${poolId}:${jid}`;
  const buf = groupBuffers.get(key);
  if (!buf || buf.running || buf.items.length === 0) return;
  buf.timer = null;
  buf.running = true;
  const batch = buf.items.splice(0); // claim the whole burst

  const pool = await db.pool.findUnique({
    where: { id: poolId },
    select: { hasOwnNumber: true, assistantName: true, ownerId: true },
  });
  const hasOwnNumber = pool?.hasOwnNumber ?? false;
  const assistantName = pool?.assistantName || "Asistente";
  const ownerId = pool?.ownerId ?? "";

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
      const filler = "Voy en esto, dame un momento… 🛠️";
      sendTracked(sock, jid, { text: hasOwnNumber ? filler : `${assistantName}: ${filler}` }).catch(() => {});
    }
  }, 8000);
  try {
    const reply = await routeMessage(
      poolId,
      { groupId: jid, sender: last.sender, text: combinedText, image: batch.map((it) => it.content.image).find(Boolean) },
      { skipRateLimit: true, hasMedia: batch.some((it) => it.content.hasMedia) }
    );
    if (reply) {
      const delivered = await deliverFilesFromReply((j, c) => sendTracked(sock, j, c), jid, reply);
      let body = delivered.text;
      if (!body && delivered.sent) body = "Ahí te va 👆";
      if (body) {
        const ogg = wantsVoiceReply(userText, wasVoice) ? await synthesizeVoiceOgg(body, ownerId) : null;
        if (ogg) {
          await sendTracked(sock, jid, { audio: ogg, ptt: true, mimetype: "audio/ogg; codecs=opus" });
        } else {
          const out = hasOwnNumber ? body : `${assistantName}: ${body}`;
          await sendTracked(sock, jid, { text: out });
        }
      }
      if (last.m.key) sock.sendMessage(jid, { react: { text: "✅", key: last.m.key } }).catch(() => {});
      log(poolId, `replied in ${jid} (batch ${batch.length})${delivered.sent ? ` (+${delivered.sent} files)` : ""}`);
    }
  } catch (e) {
    const notice =
      e instanceof PoolAtCapacity ? "Estamos a tope ahora, dame un momento. 🙏"
      : e instanceof PoolRateLimited ? "Voy un poco saturado, dame un momento. 🙏"
      : null;
    if (notice) sendNoticeOnce(sock, poolId, jid, hasOwnNumber ? notice : `${assistantName}: ${notice}`);
    log(poolId, `route failed in ${jid}: ${e}`);
  } finally {
    clearInterval(typingTimer);
    sock.sendPresenceUpdate("paused", jid).catch(() => {});
    buf.running = false;
    // Messages that landed during the turn → drain them as the next batch.
    if (buf.items.length > 0) {
      buf.timer = setTimeout(() => { void drainGroup(sock, poolId, jid); }, COALESCE_DEBOUNCE_MS);
    }
  }
}

type BaileysStatus = "qr_pending" | "pairing" | "connecting" | "connected" | "failed" | "disconnected";
// MERGE the baileys blob so a transient status change (e.g. a reconnect flipping
// to "connecting") doesn't wipe an already-issued pairingCode/qr — the UI keeps
// showing it until we actually connect. Terminal states clear the artifacts.
async function setStatus(poolId: string, status: BaileysStatus, extra: Record<string, unknown> = {}) {
  const terminal = status === "connected" || status === "disconnected" || status === "failed";
  const cur = terminal
    ? {}
    : ((await db.pool.findUnique({ where: { id: poolId }, select: { baileys: true } }).catch(() => null))?.baileys as
        | Record<string, unknown>
        | null) ?? {};
  const next = { ...cur, status, at: new Date().toISOString(), ...extra };
  await db.pool.update({ where: { id: poolId }, data: { baileys: next } }).catch(() => {});
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
export async function connectPool(poolId: string, opts: { pairingPhone?: string } = {}): Promise<void> {
  const pairingPhone = opts.pairingPhone?.replace(/[^0-9]/g, "") || undefined;
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
  sockets.set(poolId, { sock, attempts: existing?.attempts ?? 0, connecting: true, pairingPhone });
  sock.ev.on("creds.update", auth.saveCreds);

  // Pairing-code method: instead of (or alongside) the QR, request an 8-char
  // code the owner types on the phone ("Vincular con número de teléfono"). Only
  // when not already registered. Same device-link mechanism as the QR, so it
  // hits the same WhatsApp throttle — it's an alternative input, not a bypass.
  if (pairingPhone && !auth.state.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(pairingPhone);
        log(poolId, `pairing code ${code}`);
        await setStatus(poolId, "pairing", { pairingCode: code, phone: pairingPhone });
      } catch (e) {
        log(poolId, `requestPairingCode failed: ${e}`);
        await setStatus(poolId, "failed", { reason: "pairing_code_error" });
      }
    }, 1500);
  }

  sock.ev.on("connection.update", async (u) => {
    const cur = sockets.get(poolId);
    // In pairing-code mode don't clobber the code with the rotating QR.
    if (u.qr && !pairingPhone) { log(poolId, "QR ready"); await setStatus(poolId, "qr_pending", { qr: u.qr }); }
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
        setTimeout(() => void connectPool(poolId, { pairingPhone: cur?.pairingPhone }).catch(() => {}), 500);
        return;
      }
      const loggedOut = code === DisconnectReason.loggedOut;
      const attempts = (cur?.attempts ?? 0) + 1;
      if (loggedOut || attempts > MAX_RECONNECT) {
        sockets.delete(poolId);
        // Dead session: drop the stored creds so the NEXT connect re-pairs fresh.
        // Baileys leaves creds.registered=true after a logout (optimistic false
        // positive set when it generated the pairing code), which would otherwise
        // make the next connect skip requesting a new code (gate at ~L297) and
        // resume a dead session → instant re-logout loop. Only on loggedOut: a
        // max_reconnect is a transient close where the creds may still be valid.
        if (loggedOut) {
          await db.pool.update({ where: { id: poolId }, data: { authCreds: null, authKeys: null } }).catch(() => {});
        }
        log(poolId, `stopped (${loggedOut ? "logged_out" : "max_reconnect"})`);
        await setStatus(poolId, "failed", { reason: loggedOut ? "logged_out" : "max_reconnect" });
        return; // STOP — no loop
      }
      if (cur) cur.attempts = attempts;
      const backoffMs = Math.min(30_000, 1000 * 2 ** attempts);
      log(poolId, `closed → retry ${attempts}/${MAX_RECONNECT} in ${backoffMs}ms`);
      await setStatus(poolId, "connecting", { attempt: attempts });
      setTimeout(() => void connectPool(poolId, { pairingPhone: cur?.pairingPhone }).catch(() => {}), backoffMs);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const fresh = await db.pool.findUnique({
      where: { id: poolId },
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
      await recordSeenGroup(poolId, sock, jid);
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
      if (!enabled.has(jid)) { log(poolId, `msg in ${jid} ignored (group not enabled)`); continue; }
      if (!ownerId) { log(poolId, `msg in ${jid} skipped (no ownerId)`); continue; }
      // Rate-limit BEFORE extracting media so a spammy group can't run up Gemini
      // cost. We pass skipRateLimit to routeMessage to avoid double-counting.
      const rl = await checkSandboxRateLimit(`${poolId}:${jid}`, "op");
      if (!rl.allowed) {
        const notice = "Voy un poco saturado, dame un momento. 🙏";
        sendNoticeOnce(sock, poolId, jid, hasOwnNumber ? notice : `${assistantName}: ${notice}`);
        log(poolId, `msg in ${jid} rate limited`);
        continue;
      }
      // Media-aware extraction: turn images/voice/video/docs/location/etc. into the
      // text the worker brain will read. null = nothing actionable (noise) → skip.
      let content;
      try {
        content = await extractInboundContent(sock, m, { ownerId });
      } catch (e) {
        log(poolId, `media extract failed in ${jid}: ${e}`);
        continue;
      }
      if (!content) continue;
      lastIncoming.set(`${poolId}:${jid}`, m); // for wa MCP quote/react
      const text = content.text;
      log(poolId, `msg in ${jid} from ${m.key.participant ?? (fromMe ? "owner" : "?")}: "${text.slice(0, 40)}"`);
      // The turn runs COALESCED after a short debounce (drainGroup): a burst
      // becomes one turn + one reply, with a SINGLE 👀 (on start) + ✅ (on done)
      // reaction emitted there — not one 👀 per message (spammy).
      enqueueInbound(sock, poolId, jid, { content, m, sender: m.key.participant ?? undefined });
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
    // Cache groupFetchAllParticipating: the dashboard polls every ~2.5s and
    // hammering this IQ makes WhatsApp return rate-overlimit (and can degrade the
    // link). One fetch per 60s is plenty — seenGroups covers gaps in between.
    const cached = groupListCache.get(poolId);
    if (cached && Date.now() - cached.at < GROUP_CACHE_MS) {
      for (const [id, subject] of cached.groups) merged.set(id, subject);
    } else {
      try {
        const groups = await cur.sock.groupFetchAllParticipating();
        const list: Array<[string, string]> = [];
        for (const g of Object.values(groups) as any[]) list.push([g.id, g.subject || g.id]);
        groupListCache.set(poolId, { at: Date.now(), groups: list });
        for (const [id, subject] of list) merged.set(id, subject);
      } catch (e) {
        log(poolId, `groupFetch failed: ${e}`);
        if (cached) for (const [id, subject] of cached.groups) merged.set(id, subject); // serve stale
      }
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

// Execute a worker-requested WhatsApp action on the pool's live socket. Called by
// the /api/v2/pools/wa-action endpoint after it has authenticated the pool token,
// resolved sessionId → group, and gated elevated actions by mainGroupJid. `jid`
// is the target group (the session's own group, or another one for main-group
// cross-sends). Mirrors ghosty-gc's WA MCP tools.
export async function executeWaAction(
  poolId: string,
  jid: string,
  action: string,
  args: Record<string, any>
): Promise<{ ok: boolean; result?: string; error?: string }> {
  // Single-instance assumption: the socket lives in THIS process. If Fly ever runs
  // >1 machine, the worker's wa-action could land on a machine that doesn't hold
  // this pool's socket → "not connected". Keep Baileys single-instance (see the
  // SCALING CAVEAT in poolOperations busyVms).
  const cur = sockets.get(poolId);
  if (!cur) return { ok: false, error: "pool socket not connected" };
  const sock = cur.sock;
  const last = lastIncoming.get(`${poolId}:${jid}`);
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

// createPoolGroup: crea un grupo de WhatsApp NUEVO desde el número del pool y
// devuelve su invite link (chat.whatsapp.com/…). Lo consume el endpoint
// POST /api/v2/pool/:poolId/group — denik lo llama para el feature "abre el grupo
// para hablar con el agente". Registra el jid en enabledGroups para que el pool
// responda ahí. Single-instance (el socket vive en este proceso, ver caveat).
export async function createPoolGroup(
  poolId: string,
  name: string,
  denikApiKey?: string
): Promise<{ groupJid: string; inviteUrl: string }> {
  const cur = sockets.get(poolId);
  if (!cur) throw new Error("pool socket not connected");
  const sock = cur.sock;
  const meta = await sock.groupCreate(name, []); // grupo con solo el número del pool
  const groupJid = meta.id;
  const code = await sock.groupInviteCode(groupJid);
  if (!code) throw new Error("could not get group invite code");
  // Opt-in: el pool solo responde en enabledGroups → registrar el grupo nuevo.
  // Y si viene denikApiKey, guardarlo en groupKeys[groupJid] → routeMessage lo
  // inyecta per-mensaje para scopear el MCP a ESE org (aislamiento per-grupo).
  const pool = await db.pool.findUnique({
    where: { id: poolId },
    select: { enabledGroups: true, groupKeys: true },
  });
  const enabled = new Set(pool?.enabledGroups ?? []);
  enabled.add(groupJid);
  const data: { enabledGroups: string[]; groupKeys?: Record<string, string> } = {
    enabledGroups: [...enabled],
  };
  if (denikApiKey) {
    data.groupKeys = {
      ...((pool?.groupKeys as Record<string, string> | null) ?? {}),
      [groupJid]: denikApiKey,
    };
  }
  await db.pool.update({ where: { id: poolId }, data });
  return { groupJid, inviteUrl: `https://chat.whatsapp.com/${code}` };
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
    try {
      // Idle reaper de los call boxes livekit-svc (30min boot / suspende en
      // llamada / 5min post-llamada). Reusa el mismo heartbeat de 60s.
      const { reapIdleStudios } = await import("~/.server/core/studioOperations");
      await reapIdleStudios();
    } catch (e) {
      console.error("studio reaper tick failed:", e);
    }
    try {
      // Idle reaper de los agentes embed standalone (claude-worker sin pool,
      // ej. los chatbots de denik). Suspende a los idle → wake-on-message.
      const { reapIdleEmbedAgents } = await import("~/.server/core/embedAgentReaper");
      await reapIdleEmbedAgents();
    } catch (e) {
      console.error("embed-agent reaper tick failed:", e);
    }
  }, 60_000);
  if (typeof reaperTimer.unref === "function") reaperTimer.unref();
}
