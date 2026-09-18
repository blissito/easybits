/**
 * @easybits.cloud/eve-sandbox/provider — contrato NUEVO de eve
 * (`defineSandboxProvider`, PR vercel/eve#3271) sobre microVMs de EasyBits.
 *
 *   import { defineSandbox } from "eve/sandbox";
 *   import { EasybitsSandbox } from "@easybits.cloud/eve-sandbox/provider";
 *   export const environment = EasybitsSandbox.environment({ prepare: … });
 *   export default defineSandbox(() => environment.open({ networkPolicy: "deny-all" }));
 *
 * Mapeo:
 *   prepare(ctx)   → caja temporal + workspace/skills + `prepare(sandbox)` →
 *                    snapshot CoW `eve:<key>:<hash>` (idempotente por nombre).
 *                    artifact = { snapshotId, key, hash, template, version }.
 *   start(ctx, options, artifact) → fork del snapshot; `env` se hornea en
 *                    /etc/profile.d (login shell) y `networkPolicy` se aplica
 *                    al host. state = { sandboxId, sessionName, generation, version }.
 *   resume(ctx, artifact, state) → GET por id; dormida → resume; perdida →
 *                    busca por `sessionName`; si tampoco existe, re-forkea el
 *                    mismo artifact (disco nuevo; `recreateOnLoss:false` lanza).
 *   stop/shutdown  → suspend · delete → destroy.
 *
 * Nunca se serializan credenciales ni opciones en artifact/state.
 */
import type { MutableNetworkSandboxSession, SandboxEnvironment } from "eve/sandbox/provider";
import { defineSandboxProvider } from "eve/sandbox/provider";
import {
  createEasybitsProvider,
  PROVIDER_NAME,
  type EasybitsEnvironmentOptions,
  type EasybitsOpenOptions,
  type EasybitsPreparedArtifact,
  type EasybitsSessionState,
} from "./provider-impl.js";

export {
  createEasybitsProvider,
  PROVIDER_NAME,
  type EasybitsEnvironmentOptions,
  type EasybitsOpenOptions,
  type EasybitsPreparedArtifact,
  type EasybitsSessionState,
} from "./provider-impl.js";

/** `EasybitsSandbox.environment({...})` → `SandboxEnvironment` para `defineSandbox(() => environment.open())`. */
export const EasybitsSandbox = {
  name: PROVIDER_NAME,
  environment(
    options?: EasybitsEnvironmentOptions,
  ): SandboxEnvironment<EasybitsOpenOptions, MutableNetworkSandboxSession> {
    return provider.environment(options);
  },
};

const provider = defineSandboxProvider<
  EasybitsEnvironmentOptions | undefined,
  EasybitsOpenOptions,
  EasybitsPreparedArtifact,
  EasybitsSessionState,
  MutableNetworkSandboxSession
>({
  name: PROVIDER_NAME,
  environment: (options) => createEasybitsProvider(options),
});

/** Alias: `easybitsProvider(opts)` ≡ `EasybitsSandbox.environment(opts)`. */
export function easybitsProvider(options?: EasybitsEnvironmentOptions) {
  return EasybitsSandbox.environment(options);
}
