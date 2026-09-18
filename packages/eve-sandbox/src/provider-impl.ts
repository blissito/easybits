/**
 * Implementación cruda del provider #3271 (prepare/start/resume). Sin
 * importar `eve/sandbox/provider` en runtime, para poder probarla fuera de
 * eve (`scripts/smoke-provider.ts`). Ver `provider.ts` para el mapeo.
 */
import { createHash } from "node:crypto";
import { EasybitsClient, EasybitsError, type Sandbox, type SnapshotRecord } from "@easybits.cloud/sdk";
import type { SandboxNetworkPolicy, SandboxSession } from "eve/sandbox";
// `MutableNetworkSandboxSession`/`SandboxEnvironment` los exporta el PR desde
// `eve/sandbox`; el eve instalado (0.59) no los tiene, así que se toman de la
// copia del contrato hasta que #3271 mergee.
import type {
  MutableNetworkSandboxSession,
  SandboxPreparedArtifact,
  SandboxProviderHandle,
  SandboxProviderImplementation,
  SandboxProviderResources,
  SandboxProviderSessionContext,
  SandboxProviderTargetFile,
} from "eve/sandbox/provider";
import {
  BACKEND_NAME,
  SNAPSHOT_PREFIX,
  ignore404,
  openSession,
  reattach,
  resolveOptions,
  writeSeedFiles,
  type EasybitsBackendOptions,
} from "./core.js";

export const PROVIDER_NAME = BACKEND_NAME;
const ARTIFACT_VERSION = 1 as const;
const STATE_VERSION = 1 as const;

export interface EasybitsEnvironmentOptions extends EasybitsBackendOptions {
  /** Setup que hereda toda caja nueva; corre UNA vez sobre la caja temporal antes del snapshot. */
  prepare?: (sandbox: SandboxSession) => Promise<void> | void;
  /**
   * Si en `resume` la caja ya no existe en la nube, volver a forkear el
   * artifact (disco nuevo, mismo bootstrap; el `env` de `open()` se pierde
   * porque vive en el disco perdido). Default `true`; `false` lanza.
   */
  recreateOnLoss?: boolean;
}

export interface EasybitsOpenOptions {
  /** Variables de entorno visibles en `run`/`spawn` (login shell) de esta sesión. */
  env?: Record<string, string>;
  /** Política de egress inicial de la caja (misma forma que Vercel; `transform` no soportado). */
  networkPolicy?: SandboxNetworkPolicy;
}

export type EasybitsPreparedArtifact = {
  readonly hash: string;
  readonly key: string;
  readonly snapshotId: string;
  readonly template: string;
  readonly version: typeof ARTIFACT_VERSION;
};

export type EasybitsSessionState = {
  readonly generation: string;
  readonly sandboxId: string;
  readonly sessionName: string;
  readonly version: typeof STATE_VERSION;
};

type Impl = SandboxProviderImplementation<
  EasybitsOpenOptions,
  EasybitsPreparedArtifact,
  EasybitsSessionState,
  MutableNetworkSandboxSession
>;

/** Espejo de `SandboxTemplateNotProvisionedError` de eve (duck-typed por `is()`). */
class TemplateNotProvisionedError extends Error {
  readonly providerName = PROVIDER_NAME;
  constructor(readonly templateKey: string) {
    super(
      `Sandbox template "${templateKey}" is not provisioned for provider "${PROVIDER_NAME}". Run \`eve build\` before serving traffic.`,
    );
    this.name = "SandboxTemplateNotProvisionedError";
  }
}

/** Implementación cruda (prepare/start/resume). Útil para probar sin el runtime de eve. */
export function createEasybitsProvider(options: EasybitsEnvironmentOptions = {}): Impl {
  const { prepare, recreateOnLoss = true, ...rest } = options;
  const opts = resolveOptions(rest);
  const eb = new EasybitsClient({ apiKey: opts.apiKey, baseUrl: opts.baseUrl });

  const hashOf = (value: unknown) => createHash("sha256").update(stableSerialize(value)).digest("hex");

  async function findSnapshot(name: string) {
    const list = await eb.sandboxes.snapshots.list();
    return list
      .filter((s: SnapshotRecord) => s.name === name)
      .sort((a: SnapshotRecord, b: SnapshotRecord) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  }

  async function forkSession(artifact: EasybitsPreparedArtifact, sessionName: string, sessionId: string) {
    let children: Sandbox[];
    try {
      children = await eb.sandboxes.forkFromSnapshot(artifact.snapshotId, {
        count: 1,
        name: sessionName,
        metadata: { ...opts.metadata, eve_session: sessionId, eve_template: artifact.key },
        timeoutSeconds: opts.timeoutSeconds,
      });
    } catch (e) {
      if (e instanceof EasybitsError && e.status === 404) throw new TemplateNotProvisionedError(artifact.snapshotId);
      throw e;
    }
    const box = children[0];
    await box.waitUntilReady();
    // Sin esto el TTL destruiría la caja entre turnos.
    await box.setIdlePolicy({
      suspendOnIdle: true,
      idleTtlSeconds: opts.idleTtlSeconds,
      hardTtlSeconds: opts.hardTtlSeconds,
    });
    return box;
  }

  async function handleFor(box: Sandbox, sessionId: string): Promise<SandboxProviderHandle<MutableNetworkSandboxSession>> {
    const session = await openSession(box, sessionId, opts);
    return {
      sandbox: session as MutableNetworkSandboxSession,
      onSessionStop: async () => {
        await box.suspend();
      },
      onRuntimeShutdown: async () => {
        await box.suspend().catch(() => {});
      },
      onSessionDelete: async () => {
        await box.destroy().catch(ignore404);
      },
    };
  }

  return {
    async prepare(context) {
      const log = context.log ?? (() => {});
      const key = resourceKey(context.resources);
      // Lo que cambia la imagen: base, recursos (por key) y el código del prepare.
      const hash = hashOf({
        prepare: prepare?.toString(),
        resources: { skills: context.resources.skills?.key, workspace: context.resources.workspace?.key },
        template: opts.template,
        version: ARTIFACT_VERSION,
      }).slice(0, 16);
      const name = `${SNAPSHOT_PREFIX}${key}:${hash}`;
      const artifactOf = (snapshotId: string): EasybitsPreparedArtifact => ({
        hash,
        key,
        snapshotId,
        template: opts.template,
        version: ARTIFACT_VERSION,
      });

      const existing = await findSnapshot(name);
      if (existing) {
        log(`easybits: snapshot ${existing.snapshotId} reusado (${name})`);
        return artifactOf(existing.snapshotId);
      }

      log(`easybits: creando caja ${opts.template} para preparar ${name}`);
      const box = await eb.sandboxes.create({
        template: opts.template,
        timeoutSeconds: opts.timeoutSeconds,
        name: `eve-prepare-${key}`.slice(0, 60),
        metadata: { ...opts.metadata, eve_template: key },
      });
      try {
        const session = await openSession(box, `prepare:${key}`, opts);
        await writeSeedFiles(
          session,
          targetFiles(context.resources).map((f) => ({
            path: f.path,
            content: typeof f.content === "string" ? f.content : Buffer.from(f.content),
          })),
        );
        if (prepare) await prepare(session);
        log("easybits: capturando snapshot");
        const snap = await box.snapshot(name);
        log(`easybits: snapshot ${snap.snapshotId} listo`);
        return artifactOf(snap.snapshotId);
      } finally {
        // El estado vive en el snapshot; la caja de build sobra.
        await box.destroy().catch(() => {});
      }
    },

    async start(context, options, artifactValue) {
      const artifact = requireArtifact(artifactValue);
      const generation = hashOf({ artifact, template: opts.template, version: STATE_VERSION });
      const sessionName = `eve-sbx-${hashOf({ generation, sessionId: context.session.id }).slice(0, 24)}`;
      const box = await forkSession(artifact, sessionName, context.session.id);
      await applyOpenOptions(box, options);
      const handle = await handleFor(box, context.session.id);
      if (options?.networkPolicy !== undefined) await handle.sandbox.setNetworkPolicy(options.networkPolicy);
      return {
        handle,
        state: { generation, sandboxId: box.sandboxId, sessionName, version: STATE_VERSION },
      };
    },

    async resume(context, artifactValue, stateValue) {
      const artifact = requireArtifact(artifactValue);
      const state = requireState(stateValue);
      const generation = hashOf({ artifact, template: opts.template, version: STATE_VERSION });
      if (state.generation !== generation) {
        throw new Error("EasyBits sandbox session state is incompatible with this environment.");
      }
      let box = await reattach(eb, { sandboxId: state.sandboxId });
      if (!box) {
        // La caja pudo haberse re-creado en un resume anterior (el state es
        // inmutable y sigue apuntando al id viejo): buscar por nombre.
        const byName = (await eb.sandboxes.list()).find(
          (s) => s.name === state.sessionName && s.status !== "lost" && s.status !== "error",
        );
        if (byName) box = await reattach(eb, { sandboxId: byName.sandboxId });
      }
      if (!box) {
        if (!recreateOnLoss) {
          throw new Error(`EasyBits sandbox session "${state.sessionName}" (${state.sandboxId}) no longer exists.`);
        }
        box = await forkSession(artifact, state.sessionName, context.session.id);
      }
      return handleFor(box, context.session.id);
    },
  };
}

// ─── helpers ──────────────────────────────────────────────────────

/** `env` de `open()` → /etc/profile.d (los `run`/`spawn` corren en `bash -lc`). */
async function applyOpenOptions(box: Sandbox, options: Readonly<EasybitsOpenOptions> | undefined) {
  const env = options?.env;
  if (!env || Object.keys(env).length === 0) return;
  const lines = Object.entries(env).map(([k, v]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new Error(`@easybits.cloud/eve-sandbox: nombre de env inválido: ${k}`);
    return `export ${k}='${v.replace(/'/g, `'\\''`)}'`;
  });
  const script = Buffer.from(lines.join("\n") + "\n").toString("base64");
  const r = await box.exec(`mkdir -p /etc/profile.d && printf %s '${script}' | base64 -d > /etc/profile.d/eve-env.sh`, {
    timeoutSeconds: 30,
  });
  if (r.exitCode !== 0) throw new Error(`@easybits.cloud/eve-sandbox: no se pudo escribir env: ${r.stderr}`);
}

function resourceKey(resources: SandboxProviderResources): string {
  const raw = resources.source.kind === "none" ? "default" : resources.source.key;
  return raw.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 40) || "default";
}

/** Igual que `providerResourceTargetFiles` de eve: cada árbol a su `targetPath`. */
function targetFiles(resources: SandboxProviderResources): SandboxProviderTargetFile[] {
  return [resources.workspace, resources.skills].flatMap((tree) =>
    tree === undefined
      ? []
      : tree.files.map((f) => ({ content: f.content, path: `${tree.targetPath}/${f.relativePath}` })),
  );
}

function requireArtifact(value: SandboxPreparedArtifact): EasybitsPreparedArtifact {
  const a = value as Record<string, unknown> | null;
  if (
    typeof a !== "object" || a === null || Array.isArray(a) ||
    typeof a.snapshotId !== "string" || typeof a.key !== "string" ||
    typeof a.hash !== "string" || typeof a.template !== "string" || a.version !== ARTIFACT_VERSION
  ) {
    throw new Error("Invalid prepared EasyBits sandbox artifact.");
  }
  return { hash: a.hash, key: a.key, snapshotId: a.snapshotId, template: a.template, version: ARTIFACT_VERSION };
}

function requireState(s: unknown): EasybitsSessionState {
  const r = s as Record<string, unknown> | null;
  if (
    typeof r !== "object" || r === null ||
    typeof r.sandboxId !== "string" || typeof r.sessionName !== "string" ||
    typeof r.generation !== "string" || r.version !== STATE_VERSION
  ) {
    throw new Error("Invalid EasyBits sandbox session state.");
  }
  return { generation: r.generation, sandboxId: r.sandboxId, sessionName: r.sessionName, version: STATE_VERSION };
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? String(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableSerialize(v)}`)
    .join(",")}}`;
}
