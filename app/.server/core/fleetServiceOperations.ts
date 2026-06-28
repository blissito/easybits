import { db } from "../db";
import type { AuthContext } from "../apiAuth";
import { requireScope } from "../apiAuth";
import {
  createSandbox,
  getSandbox,
  waitUntilRunning,
  startAgent,
  exposeSandboxPort,
  destroySandbox,
  suspendSandbox,
  resumeSandbox,
} from "./sandboxOperations";
import type { SandboxTemplate } from "../sandbox/schemas";

// ─────────────────────────────────────────────────────────────────────────────
// Fleet service boxes — on-demand capability VMs for FleetAgents.
//
// A "fleet service" is a template-backed microVM that gives a FleetAgent a
// capability it can't do in-process: voice (whisper STT + kokoro TTS) today,
// more later. Same lifecycle pattern as the LiveKit studio box (spawnStudio):
// create → wait running → start runtime → expose ports → register for idle
// reaper. The difference: this is GENERIC over `kind` so we don't re-implement
// the lifecycle per service. The FleetAgent reaches it like it reaches
// call_create — via the remote easybits MCP (service_start/stop/status).
//
// Consumption: ports are exposed as public capability URLs
// (https://sb-<id>-<port>.sandboxes.easybits.cloud). The unguessable sandboxId
// is the gate. We expose ALL of a service's ports (voice-svc has two), so we
// sidestep the svc-mesh one-port-per-template limit without touching the host.
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceSpec {
  template: SandboxTemplate;
  unit: string;
  envFile: string;
  ports: number[]; // ports[0] = the agent/health port startAgent probes
  readyPaths: Record<number, string>; // port → HTTP path that 200s only when ready
  ttlSeconds: number;
  idleMin: number; // suspend (or destroy) after this many minutes with no use
  // suspendOnIdle: park the box (Firecracker snapshot) instead of destroying it.
  // Resume is ~700ms vs cold-boot, ideal for heavy images (Chromium). The box's
  // memory stays on disk as a snapshot until it's resumed or hard-reaped.
  suspendOnIdle?: boolean;
  // hardTtlMin: once suspended, destroy after this long to reclaim snapshot disk.
  // Measured from lastActiveAt (= suspended-since, since we don't touch it while parked).
  hardTtlMin?: number;
}

// Registro de servicios. Añadir un servicio nuevo = una entrada aquí + (si hace
// falta) un alias semántico en buildUrls. La lógica de ciclo de vida es común.
const SERVICE_REGISTRY: Record<string, ServiceSpec> = {
  voice: {
    template: "voice-svc",
    unit: "voice-svc-runtime",
    envFile: "/etc/voice-svc-runtime/.env",
    ports: [9000, 9101], // 9000 = whisper STT (health), 9101 = kokoro TTS
    readyPaths: { 9000: "/health", 9101: "/health" },
    ttlSeconds: 1800, // 30 min host TTL (hard ceiling; reaper kills sooner)
    idleMin: 10, // destroy after 10 min idle
  },
  // render: Chromium HTML→PDF/PNG box. Heavy image (~300MB) → snapshot/resume
  // pays off (warm ~700ms vs ~12s cold). Keyed per OWNER like voice, so every
  // render for that owner shares ONE box. Suspends after 5 min idle (memory
  // snapshot), and is hard-reaped after 60 min suspended to reclaim the ~2GB
  // snapshot disk — bounds accumulation across many owners while keeping warm
  // resume for active export sessions.
  render: {
    template: "render-svc",
    unit: "render-svc-runtime",
    envFile: "/etc/render-svc-runtime/.env",
    ports: [9300],
    readyPaths: { 9300: "/health" },
    ttlSeconds: 1800,
    idleMin: 5,
    suspendOnIdle: true,
    hardTtlMin: 60,
  },
};

export type ServiceKind = keyof typeof SERVICE_REGISTRY;

function specFor(kind: string): ServiceSpec {
  const spec = SERVICE_REGISTRY[kind];
  if (!spec) {
    throw new Error(
      `unknown fleet service "${kind}" — available: ${Object.keys(SERVICE_REGISTRY).join(", ")}`
    );
  }
  return spec;
}

export interface ServiceBoxHandle {
  sandboxId: string;
  kind: string;
  status: string;
  /** port → public capability URL */
  urls: Record<number, string>;
  // Semantic aliases per service (voice). Filled by buildUrls.
  transcribeUrl?: string;
  speakUrl?: string;
  // render: base URL for the box's HTTP API (POST /render/pdf, /render/screenshot).
  renderUrl?: string;
}

function buildUrls(kind: string, sandboxId: string, status: string, urls: Record<number, string>): ServiceBoxHandle {
  const h: ServiceBoxHandle = { sandboxId, kind, status, urls };
  if (kind === "voice") {
    const stt = urls[9000];
    const tts = urls[9101];
    if (stt) h.transcribeUrl = `${stt.replace(/\/$/, "")}/transcribe`;
    if (tts) h.speakUrl = `${tts.replace(/\/$/, "")}/speak`;
  }
  if (kind === "render") {
    const r = urls[9300];
    if (r) h.renderUrl = r.replace(/\/$/, "");
  }
  return h;
}

// Poll an exposed URL+path until it 200s (handles the kokoro gotcha: it binds
// :9101 ~3s after boot, when the onnx model finishes loading, and its /health
// only answers 200 after that). Returns true once ready, false on timeout.
async function waitReady(url: string, path: string, attempts = 20, delayMs = 1000): Promise<boolean> {
  const target = `${url.replace(/\/$/, "")}${path}`;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(target, { signal: AbortSignal.timeout(4000) });
      if (r.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((res) => setTimeout(res, delayMs));
  }
  return false;
}

// ensureServiceBox — idempotent. Returns the owner's running box for `kind` if it
// already exists, else spawns one. Used by BOTH the agent-facing tool
// (service_start) and the channel-agnostic fleet voice layer, so we never
// double-spawn the same service for one owner.
export async function ensureServiceBox(ctx: AuthContext, kind: string): Promise<ServiceBoxHandle> {
  requireScope(ctx, "WRITE");
  const spec = specFor(kind);

  // Reuse an existing box for this (owner, kind) — running OR still booting. The
  // `starting` case matters: two voice messages racing must NOT each spawn a VM,
  // so the second waits for the first's box instead of deleting the row.
  const existing = await db.serviceBox.findUnique({
    where: { ownerId_kind: { ownerId: ctx.user.id, kind } },
  });
  if (existing) {
    const sb = await getSandbox(ctx, existing.sandboxId).catch(() => null);
    // Parked box → wake it. Resume restores the same TAP/IP and the HTTP port
    // exposure survives (host never clears exposedPorts on suspend), so we just
    // resume, confirm running, and re-assert exposeAll (idempotent no-op). If
    // resume fails (e.g. 410 Gone after a host restart), drop the row + respawn.
    if (sb && sb.status === "suspended") {
      try {
        await resumeSandbox(ctx, existing.sandboxId);
        await waitUntilRunning(ctx, existing.sandboxId, { timeoutMs: 15_000 });
        const urls = await exposeAll(ctx, existing.sandboxId, spec.ports);
        const ready = await waitReady(
          urls[spec.ports[0]],
          spec.readyPaths[spec.ports[0]],
          10,
          500
        );
        if (!ready) throw new Error("box did not become ready after resume");
        await touchServiceBox(existing.sandboxId);
        return buildUrls(kind, existing.sandboxId, "running", urls);
      } catch (e) {
        console.error("service resume failed, respawning:", (e as Error).message);
        await db.serviceBox.delete({ where: { id: existing.id } }).catch(() => {});
        return spawnServiceBox(ctx, kind);
      }
    }
    if (sb && (sb.status === "running" || sb.status === "starting")) {
      if (sb.status === "starting") {
        const ok = await waitUntilRunning(ctx, existing.sandboxId, { timeoutMs: 60_000 }).catch(() => null);
        if (!ok) {
          // Boot stalled — drop the row and spawn fresh.
          await db.serviceBox.delete({ where: { id: existing.id } }).catch(() => {});
          return spawnServiceBox(ctx, kind);
        }
      }
      const urls = await exposeAll(ctx, existing.sandboxId, spec.ports);
      return buildUrls(kind, existing.sandboxId, "running", urls);
    }
    // Stale row (box died / TTL): drop it and spawn fresh below.
    await db.serviceBox.delete({ where: { id: existing.id } }).catch(() => {});
  }

  return spawnServiceBox(ctx, kind);
}

async function exposeAll(ctx: AuthContext, sandboxId: string, ports: number[]): Promise<Record<number, string>> {
  const exposed = await Promise.all(ports.map((p) => exposeSandboxPort(ctx, sandboxId, p)));
  const urls: Record<number, string> = {};
  ports.forEach((p, i) => (urls[p] = exposed[i].url));
  return urls;
}

// spawnServiceBox — the full lifecycle (mirror of spawnStudio). Prefer
// ensureServiceBox unless you explicitly want a fresh box.
export async function spawnServiceBox(ctx: AuthContext, kind: string): Promise<ServiceBoxHandle> {
  requireScope(ctx, "WRITE");
  const spec = specFor(kind);

  // 1. Create the VM + wait until the host reports it running.
  const sb = await createSandbox(ctx, {
    template: spec.template,
    timeoutSeconds: spec.ttlSeconds,
    name: kind,
  });
  await waitUntilRunning(ctx, sb.sandboxId, { timeoutMs: 60_000 });

  // 2. Start the runtime unit. startAgent probes ports[0] (whisper :9000); the
  //    second port (kokoro :9101) we verify ourselves below.
  await startAgent(ctx, sb.sandboxId, {
    unit: spec.unit,
    envFile: spec.envFile,
    port: spec.ports[0],
    healthPath: spec.readyPaths[spec.ports[0]],
    timeoutSeconds: 45,
    env: {},
  });

  // 3. Expose every port as a public capability URL.
  const urls = await exposeAll(ctx, sb.sandboxId, spec.ports);

  // 4. Two-port readiness: wait for EACH port's health to 200 (kokoro lags ~3s).
  await Promise.all(
    spec.ports.map((p) => (spec.readyPaths[p] ? waitReady(urls[p], spec.readyPaths[p]) : Promise.resolve(true)))
  );

  // 5. Register for the idle reaper (best-effort). upsert keeps the (owner,kind)
  //    invariant if a race created a row in between.
  await db.serviceBox
    .upsert({
      where: { ownerId_kind: { ownerId: ctx.user.id, kind } },
      create: { ownerId: ctx.user.id, kind, sandboxId: sb.sandboxId },
      update: { sandboxId: sb.sandboxId, lastActiveAt: new Date() },
    })
    .catch((e) => console.error("service reaper: register failed:", e));

  return buildUrls(kind, sb.sandboxId, "running", urls);
}

export async function getServiceBox(ctx: AuthContext, opts: { kind?: string; sandboxId?: string }): Promise<ServiceBoxHandle | null> {
  requireScope(ctx, "READ");
  const row = opts.sandboxId
    ? await db.serviceBox.findUnique({ where: { sandboxId: opts.sandboxId } })
    : opts.kind
    ? await db.serviceBox.findUnique({ where: { ownerId_kind: { ownerId: ctx.user.id, kind: opts.kind } } })
    : null;
  if (!row || row.ownerId !== ctx.user.id) return null;
  const sb = await getSandbox(ctx, row.sandboxId).catch(() => null);
  if (!sb) return null;
  const spec = specFor(row.kind);
  const urls = sb.status === "running" ? await exposeAll(ctx, row.sandboxId, spec.ports) : {};
  return buildUrls(row.kind, row.sandboxId, sb.status, urls);
}

export async function destroyServiceBox(ctx: AuthContext, sandboxId: string): Promise<{ ok: true }> {
  requireScope(ctx, "WRITE");
  await destroySandbox(ctx, sandboxId);
  await db.serviceBox.deleteMany({ where: { sandboxId } }).catch(() => {});
  return { ok: true };
}

// Refresh the idle clock — called by the consume path (voice_stt/voice_tts) so
// the reaper measures real usage, not just boot time.
export async function touchServiceBox(sandboxId: string): Promise<void> {
  await db.serviceBox.updateMany({ where: { sandboxId }, data: { lastActiveAt: new Date() } }).catch(() => {});
}

// ── reapIdleServiceBoxes ─────────────────────────────────────────────────────
// Idle reaper, runs on the 60s heartbeat alongside reapIdleStudios. Per box:
// idle past its kind's idleMin → destroy. If the box is already gone (host TTL)
// past the host TTL window, drop the orphan row. Simpler than reapIdleStudios:
// no participant polling — a service box has no "active call" concept.
export async function reapIdleServiceBoxes(): Promise<{ checked: number; destroyed: number; suspended: number }> {
  let destroyed = 0;
  let suspended = 0;
  const now = Date.now();
  const boxes = await db.serviceBox.findMany();
  for (const box of boxes) {
    const spec = SERVICE_REGISTRY[box.kind];
    const idleMin = spec?.idleMin ?? 10;
    const ttlMin = (spec?.ttlSeconds ?? 1800) / 60;
    const ctx = await ctxForServiceOwner(box.ownerId).catch(() => null);
    if (!ctx) continue;
    try {
      const sb = await getSandbox(ctx, box.sandboxId).catch(() => null);
      if (!sb || sb.status === "stopped" || sb.status === "error" || sb.status === "lost") {
        // Box already gone — clean the orphan row once past the host TTL window
        // (so a transient blip doesn't delete it early).
        if (now - box.createdAt.getTime() >= ttlMin * 60_000) {
          await db.serviceBox.deleteMany({ where: { id: box.id } }).catch(() => {});
        }
        continue;
      }
      // Already parked: leave it (resume is cheap), but destroy if it's been
      // suspended past hardTtl to reclaim the snapshot disk. lastActiveAt doubles
      // as "suspended-since" — we never touch it while parked.
      if (sb.status === "suspended") {
        const hardTtlMin = spec?.hardTtlMin ?? 720;
        if (now - box.lastActiveAt.getTime() >= hardTtlMin * 60_000) {
          await destroyServiceBox(ctx, box.sandboxId);
          destroyed++;
        }
        continue;
      }
      if (now - box.lastActiveAt.getTime() >= idleMin * 60_000) {
        if (spec?.suspendOnIdle) {
          // Park, don't kill. Keep the row + lastActiveAt (now the suspended-since
          // clock). Next ensureServiceBox resumes it in ~700ms.
          await suspendSandbox(ctx, box.sandboxId);
          suspended++;
        } else {
          await destroyServiceBox(ctx, box.sandboxId);
          destroyed++;
        }
      }
    } catch (e) {
      console.error(`service reaper: poll ${box.sandboxId} failed:`, (e as Error).message);
    }
  }
  return { checked: boxes.length, destroyed, suspended };
}

// Background AuthContext for the box owner (the reaper runs outside any HTTP
// request). Same pattern as ctxForStudioOwner / the pool reaper's ctxForOwner.
async function ctxForServiceOwner(ownerId: string): Promise<AuthContext> {
  const user = await db.user.findUnique({ where: { id: ownerId } });
  if (!user) throw new Error(`service owner ${ownerId} not found`);
  return { user, scopes: ["READ", "WRITE", "DELETE"] };
}
