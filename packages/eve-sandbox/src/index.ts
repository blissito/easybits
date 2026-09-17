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
 *   delete()              → destroy.
 *
 * Todo pasa por la REST API pública vía `@easybits.cloud/sdk`; el paquete
 * nunca habla con un fierro directo.
 */
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
  /** Intervalo de poll de procesos `spawn()` en ms. Default 500. */
  spawnPollMs?: number;
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
    spawnPollMs: o.spawnPollMs ?? 500,
  };
}

/** Crea el backend. Se pasa a `defineSandbox({ backend: easybits() })`. */
export function easybits(options: EasybitsBackendOptions = {}): SandboxBackend {
  const opts = resolveOptions(options);
  const eb = new EasybitsClient({ apiKey: opts.apiKey, baseUrl: opts.baseUrl });

  const snapshotName = (templateKey: string) => SNAPSHOT_PREFIX + templateKey;

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
  if (box.status === "suspended") await box.resume();
  if (box.status === "stopped" || box.status === "lost" || box.status === "error") return undefined;
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

  const resolvePath = (p: string) => (p.startsWith("/") ? p : `${workdir}/${p}`.replace(/\/+/g, "/"));

  async function ensureDir(dir: string) {
    if (knownDirs.has(dir)) return;
    await box.exec(`mkdir -p ${shellQuote(dir)}`, { timeoutSeconds: 30 });
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

  async function run(o: SandboxRunOptions) {
    const r = await box.exec(o.command, {
      cwd: o.workingDirectory ?? workdir,
      env: o.env,
      timeoutSeconds: opts.runTimeoutSeconds,
    });
    return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
  }

  async function spawn(o: SandboxSpawnOptions): Promise<SandboxProcess> {
    const { execId } = await box.execBackground(o.command, {
      cwd: o.workingDirectory ?? workdir,
      env: o.env,
    });
    return pollingProcess(box, execId, opts.spawnPollMs, o.abortSignal);
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
      const b = await readBytes(path);
      if (!b) return null;
      const text = Buffer.from(b).toString((encoding ?? "utf-8") as BufferEncoding);
      return sliceLines(text, startLine, endLine);
    },
    writeFile: async ({ path, content }) => writeBytes(path, await streamToBytes(content)),
    writeBinaryFile: async ({ path, content }) => writeBytes(path, content),
    writeTextFile: async ({ path, content, encoding }) =>
      writeBytes(path, new Uint8Array(Buffer.from(content, (encoding ?? "utf-8") as BufferEncoding))),
    // `rm` por exec en vez de `/files/delete`: el agente in-VM responde 500 (no
    // 404) ante un path inexistente, y `force` debe ignorarlo en silencio.
    removePath: async (o) => {
      const flags = `-${o.recursive ? "r" : ""}${o.force ? "f" : ""}`.replace(/^-$/, "");
      const r = await box.exec(`rm ${flags} ${shellQuote(resolvePath(o.path))}`, { timeoutSeconds: 60 });
      if (r.exitCode !== 0) throw new Error(`removePath ${o.path}: ${r.stderr.trim() || `exit ${r.exitCode}`}`);
    },
    // La microVM sale por un firewall de egress fijo del fierro; no hay
    // política por dominio en vivo. Solo aceptamos lo que ya es verdad.
    setNetworkPolicy: async (policy: SandboxNetworkPolicy) => {
      if (policy === "allow-all") return;
      throw new Error(
        `@easybits.cloud/eve-sandbox: setNetworkPolicy solo soporta "allow-all" (recibido ${JSON.stringify(policy)})`,
      );
    },
  };
}

/**
 * Proceso `spawn()` sobre `/bg`: el host guarda stdout/stderr acumulados y
 * aquí se emiten los deltas por poll. No es streaming en tiempo real, pero
 * `wait()`/`kill()` son exactos (el kill señala al grupo de procesos).
 */
function pollingProcess(box: Sandbox, execId: string, pollMs: number, signal?: AbortSignal): SandboxProcess {
  let sentOut = 0;
  let sentErr = 0;
  let outCtl!: ReadableStreamDefaultController<Uint8Array>;
  let errCtl!: ReadableStreamDefaultController<Uint8Array>;
  const stdout = new ReadableStream<Uint8Array>({ start: (c) => { outCtl = c; } });
  const stderr = new ReadableStream<Uint8Array>({ start: (c) => { errCtl = c; } });
  const enc = new TextEncoder();

  const done = (async () => {
    try {
      for (;;) {
        const s = await box.bgStatus(execId);
        if (s.stdout.length > sentOut) { outCtl.enqueue(enc.encode(s.stdout.slice(sentOut))); sentOut = s.stdout.length; }
        if (s.stderr.length > sentErr) { errCtl.enqueue(enc.encode(s.stderr.slice(sentErr))); sentErr = s.stderr.length; }
        if (s.status === "exited") return { exitCode: s.exitCode ?? -1 };
        await sleep(pollMs);
      }
    } finally {
      try { outCtl.close(); } catch {}
      try { errCtl.close(); } catch {}
    }
  })();

  const kill = async () => {
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

/** Rango 1-based inclusivo; `endLine` pasado de EOF devuelve hasta el final. */
function sliceLines(text: string, start?: number, end?: number) {
  if (start === undefined && end === undefined) return text;
  const lines = text.split("\n");
  const from = Math.max(1, start ?? 1) - 1;
  const to = end === undefined ? lines.length : Math.min(lines.length, end);
  return lines.slice(from, to).join("\n");
}
