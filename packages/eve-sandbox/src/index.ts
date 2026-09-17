/**
 * @easybits.cloud/eve-sandbox — SandboxBackend de eve (Vercel) sobre
 * microVMs Firecracker de EasyBits.
 *
 *   import { easybits } from "@easybits.cloud/eve-sandbox";
 *   export default defineSandbox({ backend: easybits(), bootstrap: … });
 *
 * Mapeo del contrato de eve a la nube:
 *   prewarm(templateKey)  → caja temporal + seeds + bootstrap → snapshot CoW
 *                           llamado `eve:<templateKey>` (idempotente: si ya
 *                           existe se reusa) → la caja temporal se destruye.
 *   create(templateKey)   → fork del snapshot (o caja fresca si eve mandó
 *                           `templateKey: null`). Con `existingMetadata`
 *                           reattacha la caja anterior (resume si dormía).
 *   stop()/shutdown()     → suspend (snapshot Firecracker, resume ~1s).
 *   setNetworkPolicy()    → PUT /sandboxes/:id/network-policy (allow-all/deny-all/allow-list).
 *   delete()              → destroy.
 *
 * Todo pasa por la REST API pública vía `@easybits.cloud/sdk`; el paquete
 * nunca habla con un fierro directo.
 */
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { EasybitsClient, EasybitsError, type Sandbox, type SandboxTemplate, type SnapshotRecord } from "@easybits.cloud/sdk";
import type {
  SandboxBackend,
  SandboxBackendCreateInput,
  SandboxBackendHandle,
  SandboxBackendPrewarmInput,
  SandboxBackendSessionState,
  SandboxNetworkPolicy,
  SandboxProcess,
  SandboxRunOptions,
  SandboxSeedFile,
  SandboxSession,
  SandboxSpawnOptions,
} from "eve/sandbox";
import { SandboxTemplateNotProvisionedError } from "eve/sandbox";

export const BACKEND_NAME = "easybits";
const SNAPSHOT_PREFIX = "eve:";
const DEFAULT_WORKDIR = "/workspace";

export interface EasybitsBackendOptions {
  /** API key de EasyBits. Default: `process.env.EASYBITS_API_KEY`. */
  apiKey?: string;
  /** Default: https://www.easybits.cloud */
  baseUrl?: string;
  /** Template base de la caja que se bootstrapea. Default `"node"`. */
  template?: SandboxTemplate;
  /** TTL de cada caja de sesión (segundos). Default 3600. */
  timeoutSeconds?: number;
  /** Directorio al que se anclan las rutas relativas. Default `/workspace`. */
  workingDirectory?: string;
  /** Timeout de `run()` (segundos). Default 600. */
  runTimeoutSeconds?: number;
  /** Metadata extra que se pega a cada caja (además de los tags de eve). */
  metadata?: Record<string, string>;
  /** Intervalo inicial de poll de procesos `spawn()` en ms (backoff ×1.5 hasta 1s). Default 150. */
  spawnPollMs?: number;
  /**
   * Inactividad tras la cual la caja de sesión se SUSPENDE (no se destruye).
   * eve deja la caja viva entre turnos; sin esto, el TTL la mataría y el
   * siguiente turno arrancaría en una caja vacía. Default 600.
   */
  idleTtlSeconds?: number;
  /** Plazo tras el cual una caja dormida sí se destruye. Default 7 días. */
  hardTtlSeconds?: number;
}

type ResolvedOptions = Required<Omit<EasybitsBackendOptions, "apiKey" | "baseUrl">> & {
  apiKey: string;
  baseUrl?: string;
};

function resolveOptions(o: EasybitsBackendOptions): ResolvedOptions {
  const apiKey = o.apiKey ?? process.env.EASYBITS_API_KEY;
  if (!apiKey) throw new Error("@easybits.cloud/eve-sandbox: falta apiKey (o EASYBITS_API_KEY)");
  return {
    apiKey,
    baseUrl: o.baseUrl ?? process.env.EASYBITS_BASE_URL,
    template: o.template ?? "node",
    timeoutSeconds: o.timeoutSeconds ?? 3600,
    workingDirectory: o.workingDirectory ?? DEFAULT_WORKDIR,
    runTimeoutSeconds: o.runTimeoutSeconds ?? 600,
    metadata: o.metadata ?? {},
    spawnPollMs: o.spawnPollMs ?? 150,
    idleTtlSeconds: o.idleTtlSeconds ?? 600,
    hardTtlSeconds: o.hardTtlSeconds ?? 7 * 24 * 3600,
  };
}

/** Crea el backend. Se pasa a `defineSandbox({ backend: easybits() })`. */
export function easybits(options: EasybitsBackendOptions = {}): SandboxBackend {
  const opts = resolveOptions(options);
  const eb = new EasybitsClient({ apiKey: opts.apiKey, baseUrl: opts.baseUrl });

  // El nombre lleva un hash de las opciones que cambian la imagen: cambiar
  // `template` no debe reusar un snapshot bootstrapeado sobre otra base.
  const optionsHash = createHash("sha256").update(JSON.stringify({ template: opts.template })).digest("hex").slice(0, 8);
  const snapshotName = (templateKey: string) => `${SNAPSHOT_PREFIX}${templateKey}:${optionsHash}`;

  async function findSnapshot(templateKey: string) {
    const list = await eb.sandboxes.snapshots.list();
    const name = snapshotName(templateKey);
    // El más reciente gana si hubo dos prewarm concurrentes.
    return list
      .filter((s: SnapshotRecord) => s.name === name)
      .sort((a: SnapshotRecord, b: SnapshotRecord) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  }

  async function prewarm(input: SandboxBackendPrewarmInput): Promise<{ reused: boolean }> {
    const log = input.log ?? (() => {});
    const existing = await findSnapshot(input.templateKey);
    if (existing) {
      log(`easybits: snapshot ${existing.snapshotId} reusado para ${input.templateKey}`);
      return { reused: true };
    }
    log(`easybits: creando caja ${opts.template} para bootstrap de ${input.templateKey}`);
    const box = await eb.sandboxes.create({
      template: opts.template,
      timeoutSeconds: opts.timeoutSeconds,
      name: `eve-prewarm-${input.templateKey}`.slice(0, 60),
      metadata: { ...opts.metadata, eve_template: input.templateKey },
    });
    try {
      const session = await openSession(box, input.templateKey, opts);
      await writeSeedFiles(session, input.seedFiles);
      if (input.bootstrap) {
        await input.bootstrap({ use: async () => session });
      }
      log("easybits: capturando snapshot");
      const snap = await box.snapshot(snapshotName(input.templateKey));
      log(`easybits: snapshot ${snap.snapshotId} listo`);
      return { reused: false };
    } finally {
      // La caja de build no sirve para nada más: el estado vive en el snapshot.
      await box.destroy().catch(() => {});
    }
  }

  async function create(input: SandboxBackendCreateInput): Promise<SandboxBackendHandle> {
    const metadata = {
      ...opts.metadata,
      ...(input.tags ?? {}),
      eve_session: input.sessionKey,
      ...(input.templateKey ? { eve_template: input.templateKey } : {}),
    };

    let box: Sandbox | undefined = await reattach(eb, input.existingMetadata);
    if (!box) {
      if (input.templateKey) {
        const snap = await findSnapshot(input.templateKey);
        if (!snap) {
          throw new SandboxTemplateNotProvisionedError({
            backendName: BACKEND_NAME,
            templateKey: input.templateKey,
          });
        }
        const [child] = await eb.sandboxes.forkFromSnapshot(snap.snapshotId, {
          count: 1,
          name: `eve-${input.sessionKey}`.slice(0, 60),
          metadata,
          timeoutSeconds: opts.timeoutSeconds,
        });
        box = child;
      } else {
        box = await eb.sandboxes.create({
          template: opts.template,
          timeoutSeconds: opts.timeoutSeconds,
          name: `eve-${input.sessionKey}`.slice(0, 60),
          metadata,
          waitForReady: false,
        });
      }
      await box.waitUntilReady();
      // Sin esto el TTL destruiría la caja entre turnos y el siguiente
      // `create` con `existingMetadata` la encontraría muerta.
      await box.setIdlePolicy({
        suspendOnIdle: true,
        idleTtlSeconds: opts.idleTtlSeconds,
        hardTtlSeconds: opts.hardTtlSeconds,
      });
    }
    const live: Sandbox = box;

    const session = await openSession(live, input.sessionKey, opts);
    const state: SandboxBackendSessionState = {
      backendName: BACKEND_NAME,
      metadata: { sandboxId: live.sandboxId },
      sessionKey: input.sessionKey,
    };
    return {
      session,
      useSessionFn: async () => session,
      captureState: async () => state,
      delete: async () => {
        await live.destroy().catch(ignore404);
      },
      stop: async () => {
        await live.suspend();
      },
      shutdown: async () => {
        await live.suspend().catch(ignore404);
      },
    };
  }

  return { name: BACKEND_NAME, create, prewarm };
}

/** Reabre la caja de un handle persistido; `undefined` si ya no existe. */
async function reattach(eb: EasybitsClient, meta?: Record<string, unknown>): Promise<Sandbox | undefined> {
  const id = meta?.sandboxId;
  if (typeof id !== "string") return undefined;
  let box: Sandbox;
  try {
    box = await eb.sandboxes.get(id);
  } catch (e) {
    if (e instanceof EasybitsError && e.status === 404) return undefined;
    throw e;
  }
  if (box.status === "lost" || box.status === "error") return undefined;
  if (box.status === "suspended") {
    try {
      await box.resume();
    } catch (e) {
      throw new Error(`@easybits.cloud/eve-sandbox: no se pudo reanudar la caja ${id}: ${(e as Error).message}`);
    }
  }
  await box.waitUntilReady();
  return box;
}

function ignore404(e: unknown) {
  if (e instanceof EasybitsError && e.status === 404) return;
  throw e;
}

async function writeSeedFiles(session: SandboxSession, seeds: ReadonlyArray<SandboxSeedFile>) {
  for (const seed of seeds) {
    const content = typeof seed.content === "string" ? seed.content : new Uint8Array(seed.content);
    if (typeof content === "string") {
      await session.writeTextFile({ path: seed.path, content });
    } else {
      await session.writeBinaryFile({ path: seed.path, content });
    }
  }
}

// ─── Sesión ───────────────────────────────────────────────────────

async function openSession(box: Sandbox, id: string, opts: ResolvedOptions): Promise<SandboxSession> {
  const workdir = opts.workingDirectory;
  const knownDirs = new Set<string>();

  // eve manda rutas `$HOME/.agents/skills/…` (seeds de skills); se resuelven
  // contra el HOME real de la caja, una vez por sesión.
  const homeProbe = await box.exec('printf %s "$HOME"', { timeoutSeconds: 30 });
  const home = homeProbe.exitCode === 0 && homeProbe.stdout.trim() ? homeProbe.stdout.trim() : "/root";

  const resolvePath = (p: string) => {
    if (p === "$HOME" || p.startsWith("$HOME/")) p = home + p.slice("$HOME".length);
    return (p.startsWith("/") ? p : `${workdir}/${p}`).replace(/\/+/g, "/");
  };

  async function ensureDir(dir: string) {
    if (knownDirs.has(dir)) return;
    await box.exec(`mkdir -p -- ${shellQuote(dir)}`, { timeoutSeconds: 30 });
    knownDirs.add(dir);
  }
  await ensureDir(workdir);

  async function readBytes(path: string): Promise<Uint8Array | null> {
    try {
      const r = await box.files.read(resolvePath(path), { encoding: "base64" });
      return new Uint8Array(Buffer.from(r.content, "base64"));
    } catch (e) {
      if (e instanceof EasybitsError && e.status === 404) return null;
      throw e;
    }
  }

  async function writeBytes(path: string, bytes: Uint8Array) {
    const abs = resolvePath(path);
    await ensureDir(dirname(abs));
    await box.files.write(abs, Buffer.from(bytes).toString("base64"), { encoding: "base64" });
  }

  // Como eve en Docker: login shell para que PATH/perfil apliquen.
  const loginShell = (command: string) => `bash -lc ${shellQuote(command)}`;

  async function spawn(o: SandboxSpawnOptions): Promise<SandboxProcess> {
    const { execId } = await box.execBackground(loginShell(o.command), {
      cwd: o.workingDirectory ?? workdir,
      env: o.env,
    });
    return pollingProcess(box, execId, opts.spawnPollMs, o.abortSignal);
  }

  // `run` sobre `spawn` (como eve): sin el tope de 600s del exec síncrono y
  // con abortSignal.
  async function run(o: SandboxRunOptions) {
    const p = await spawn(o);
    const [stdout, stderr, { exitCode }] = await Promise.all([
      streamToString(p.stdout),
      streamToString(p.stderr),
      p.wait(),
    ]);
    return { exitCode, stdout, stderr };
  }

  return {
    id,
    resolvePath,
    run,
    spawn,
    readFile: async ({ path }) => {
      const b = await readBytes(path);
      return b ? bytesToStream(b) : null;
    },
    readBinaryFile: async ({ path }) => readBytes(path),
    readTextFile: async ({ path, encoding, startLine, endLine }) => {
      validateLineRange(startLine, endLine);
      const b = await readBytes(path);
      if (!b) return null;
      return sliceLines(decodeText(b, encoding ?? "utf-8"), startLine, endLine);
    },
    writeFile: async ({ path, content }) => writeBytes(path, await streamToBytes(content)),
    writeBinaryFile: async ({ path, content }) => writeBytes(path, content),
    writeTextFile: async ({ path, content, encoding }) =>
      writeBytes(path, new Uint8Array(Buffer.from(content, (encoding ?? "utf-8") as BufferEncoding))),
    // `rm` por exec en vez de `/files/delete`: el agente in-VM responde 500 (no
    // 404) ante un path inexistente, y `force` debe ignorarlo en silencio.
    removePath: async (o) => {
      const flags = `-${o.recursive ? "r" : ""}${o.force ? "f" : ""}`.replace(/^-$/, "");
      const r = await box.exec(`rm ${flags} -- ${shellQuote(resolvePath(o.path))}`, { timeoutSeconds: 60 });
      if (r.exitCode !== 0) throw new Error(`removePath ${o.path}: ${r.stderr.trim() || `exit ${r.exitCode}`}`);
    },
    // Política de egress POR CAJA (mismo shape que Vercel Sandbox). `transform`
    // (headers inyectados en el firewall) no existe en EasyBits: se rechaza aquí
    // con un error claro en vez de un 400 opaco del servidor.
    setNetworkPolicy: async (policy: SandboxNetworkPolicy) => {
      if (typeof policy === "object" && policy && "allow" in policy) {
        for (const rules of Object.values(policy.allow ?? {})) {
          if (Array.isArray(rules) && rules.some((r) => r && typeof r === "object" && "transform" in r)) {
            throw new Error(
              "@easybits.cloud/eve-sandbox: setNetworkPolicy no soporta `transform` (inyección de headers); usa allow-all, deny-all o una allow-list por dominio",
            );
          }
        }
      }
      await box.setNetworkPolicy(policy as Parameters<Sandbox["setNetworkPolicy"]>[0]);
    },
  };
}

/**
 * Proceso `spawn()` sobre `/bg`: el host guarda stdout/stderr acumulados y
 * aquí se emiten los deltas por poll (150ms → ×1.5 → 1s). No es streaming en
 * tiempo real, pero `wait()`/`kill()` son exactos (el kill señala al grupo).
 */
function pollingProcess(box: Sandbox, execId: string, pollMs: number, signal?: AbortSignal): SandboxProcess {
  let prevOut = "";
  let prevErr = "";
  let aborted = false;
  let outCtl!: ReadableStreamDefaultController<Uint8Array>;
  let errCtl!: ReadableStreamDefaultController<Uint8Array>;
  const stdout = new ReadableStream<Uint8Array>({ start: (c) => { outCtl = c; } });
  const stderr = new ReadableStream<Uint8Array>({ start: (c) => { errCtl = c; } });
  const enc = new TextEncoder();
  let wake: (() => void) | undefined;

  // El buffer del agente recorta por arriba al pasar 1MB: si lo acumulado ya no
  // empieza por lo emitido, se manda entero (mejor duplicar que callar).
  const emit = (ctl: ReadableStreamDefaultController<Uint8Array>, prev: string, cur: string) => {
    if (cur === prev) return prev;
    ctl.enqueue(enc.encode(cur.startsWith(prev) ? cur.slice(prev.length) : cur));
    return cur;
  };

  const done = (async () => {
    let delay = pollMs;
    try {
      for (;;) {
        const s = await box.bgStatus(execId);
        prevOut = emit(outCtl, prevOut, s.stdout);
        prevErr = emit(errCtl, prevErr, s.stderr);
        if (s.status === "exited") return { exitCode: s.exitCode ?? -1 };
        if (aborted) return { exitCode: -1 };
        await new Promise<void>((r) => { wake = r; setTimeout(r, delay); });
        wake = undefined;
        if (aborted) return { exitCode: -1 };
        delay = Math.min(1000, delay * 1.5);
      }
    } catch (e) {
      outCtl.error(e);
      errCtl.error(e);
      throw e;
    } finally {
      try { outCtl.close(); } catch {}
      try { errCtl.close(); } catch {}
    }
  })();

  const kill = async () => {
    aborted = true;
    wake?.();
    await box.bgKill(execId).catch(ignore404);
  };
  signal?.addEventListener("abort", () => void kill(), { once: true });

  return { stdout, stderr, wait: () => done, kill };
}

// ─── utils ────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function shellQuote(s: string) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function bytesToStream(b: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(c) { c.enqueue(b); c.close(); } });
}

async function streamToBytes(s: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = s.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function validateLineRange(start?: number, end?: number) {
  if (start !== undefined && (!Number.isInteger(start) || start < 1)) throw new Error("startLine must be a positive integer (1-based).");
  if (end !== undefined && (!Number.isInteger(end) || end < 1)) throw new Error("endLine must be a positive integer (1-based).");
  if (start !== undefined && end !== undefined && start > end) throw new Error("startLine must not be greater than endLine.");
}

/** Rango 1-based inclusivo que conserva los finales de línea (\n y \r\n); `endLine` pasado de EOF devuelve hasta el final. */
function sliceLines(text: string, start?: number, end?: number) {
  if (start === undefined && end === undefined) return text;
  const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? [];
  return lines.slice((start ?? 1) - 1, end ?? lines.length).join("");
}

function decodeText(b: Uint8Array, encoding: string) {
  if (encoding === "utf-8" || encoding === "utf8") return new TextDecoder("utf-8", { fatal: true }).decode(b);
  return Buffer.from(b).toString(encoding as BufferEncoding);
}

async function streamToString(s: ReadableStream<Uint8Array>) {
  return new TextDecoder().decode(await streamToBytes(s));
}
