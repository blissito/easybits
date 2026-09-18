/**
 * @easybits.cloud/eve-sandbox — SandboxBackend de eve (Vercel) sobre
 * microVMs Firecracker de EasyBits.
 *
 *   import { easybits } from "@easybits.cloud/eve-sandbox";
 *   export default defineSandbox({ backend: easybits(), bootstrap: … });
 *
 * Mapeo del contrato de eve a la nube:
 *   prewarm(templateKey)  → caja temporal + seeds + bootstrap → plantilla
 *                           DERIVADA (`template-snapshot`) con clave de contenido
 *                           (key `eve:<templateKey>`, hash de las opciones que
 *                           cambian la imagen). Idempotente en el host: si el par
 *                           ya existe, `reused`. La caja temporal se destruye.
 *   create(templateKey)   → `sandboxes.create({ templateKey, templateHash })`: la
 *                           caja nace con el bootstrap hecho (~24 ms + boot), sin
 *                           fork. 404 DerivedTemplateNotProvisioned →
 *                           SandboxTemplateNotProvisionedError (eve hace prewarm).
 *                           Con `existingMetadata` reattacha la caja anterior.
 *   stop()/shutdown()     → suspend (snapshot Firecracker, resume ~1s).
 *   setNetworkPolicy()    → PUT /sandboxes/:id/network-policy (allow-all/deny-all/allow-list).
 *   delete()              → destroy.
 *
 * Todo pasa por la REST API pública vía `@easybits.cloud/sdk`; el paquete
 * nunca habla con un fierro directo.
 */
import { EasybitsClient, EasybitsError, type Sandbox } from "@easybits.cloud/sdk";
import type {
  SandboxBackend,
  SandboxBackendCreateInput,
  SandboxBackendHandle,
  SandboxBackendPrewarmInput,
  SandboxBackendSessionState,
} from "eve/sandbox";
import { SandboxTemplateNotProvisionedError } from "eve/sandbox";
import {
  BACKEND_NAME,
  SNAPSHOT_PREFIX,
  derivedTemplateRef,
  ignore404,
  openSession,
  reattach,
  resolveOptions,
  writeSeedFiles,
  type EasybitsBackendOptions,
} from "./core.js";

export { BACKEND_NAME, type EasybitsBackendOptions } from "./core.js";

/** Crea el backend. Se pasa a `defineSandbox({ backend: easybits() })`. */
export function easybits(options: EasybitsBackendOptions = {}): SandboxBackend {
  const opts = resolveOptions(options);
  const eb = new EasybitsClient({ apiKey: opts.apiKey, baseUrl: opts.baseUrl });

  // Clave de contenido de la plantilla derivada: `eve:<templateKey>` + hash de
  // las opciones que cambian la imagen (cambiar `template` no debe reusar un
  // bootstrap hecho sobre otra base). El host es idempotente por (key, hash).
  const refOf = (templateKey: string) => derivedTemplateRef(templateKey, { template: opts.template });

  async function prewarm(input: SandboxBackendPrewarmInput): Promise<{ reused: boolean }> {
    const log = input.log ?? (() => {});
    const ref = refOf(input.templateKey);
    const existing = await eb.sandboxes.templateSnapshots.get(ref).catch(ignore404);
    if (existing) {
      log(`easybits: plantilla derivada ${existing.derivedId} reusada para ${input.templateKey}`);
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
      log("easybits: capturando plantilla derivada");
      const dt = await box.templateSnapshot({ ...ref, name: `eve ${input.templateKey}`.slice(0, 64) });
      log(`easybits: plantilla ${dt.derivedId} lista (${Math.round(dt.sizeBytes / 1048576)} MB${dt.reused ? ", reusada" : ""})`);
      return { reused: !!dt.reused };
    } finally {
      // La caja de build no sirve para nada más: el estado vive en la plantilla.
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
        const ref = refOf(input.templateKey);
        try {
          box = await eb.sandboxes.create({
            template: opts.template,
            templateKey: ref.key,
            templateHash: ref.hash,
            timeoutSeconds: opts.timeoutSeconds,
            name: `eve-${input.sessionKey}`.slice(0, 60),
            metadata,
            waitForReady: false,
          });
        } catch (e) {
          // 404 = el par (key, hash) no está preparado; 409 = el template base se
          // rehorneó y la plantilla quedó stale. En ambos eve debe volver a prewarm.
          if (e instanceof EasybitsError && (e.status === 404 || e.status === 409)) {
            throw new SandboxTemplateNotProvisionedError({
              backendName: BACKEND_NAME,
              templateKey: input.templateKey,
            });
          }
          throw e;
        }
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
