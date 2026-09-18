/**
 * Contrato del provider NUEVO de eve (`defineSandboxProvider`), copiado de
 * vercel/eve PR #3271, rama `spike/dockerfile-sandbox-local`,
 * commit 61efc2558581398de866b93d451745bdac50d55a
 * (`packages/eve/src/shared/sandbox-provider.ts`,
 *  `sandbox-environment.ts`, `sandbox-session.ts`, `sandbox-template-error.ts`).
 *
 * Solo tipos: el runtime (`defineSandboxProvider`) lo aporta eve al importar
 * `eve/sandbox/provider`. Este archivo se mapea a ese specifier vía `paths`
 * en tsconfig mientras el eve instalado (≤ 0.59) no lo exporte. Cuando #3271
 * mergee, borrar el alias y tipar contra eve directo.
 */
import type {
  SandboxNetworkPolicy,
  SandboxProcess,
  SandboxReadFileOptions,
  SandboxSession,
  SandboxSpawnOptions,
  SandboxWriteFileOptions,
} from "eve/sandbox";

export type { SandboxNetworkPolicy, SandboxSession };

export interface MutableNetworkSandboxSession extends SandboxSession {
  setNetworkPolicy(policy: SandboxNetworkPolicy): Promise<void>;
}

export interface SandboxRemovePathOptions {
  readonly abortSignal?: AbortSignal;
  readonly force?: boolean;
  readonly path: string;
  readonly recursive?: boolean;
}

/** Primitivas que un provider aporta; `buildSandboxSession` (en eve) arma el resto. */
export interface InternalSandboxSession {
  spawn(options: SandboxSpawnOptions): Promise<SandboxProcess>;
  readFile(options: SandboxReadFileOptions): Promise<ReadableStream<Uint8Array> | null>;
  writeFile(options: SandboxWriteFileOptions): Promise<void>;
  removePath(options: SandboxRemovePathOptions): Promise<void>;
  resolvePath(path: string): string;
}

export interface SandboxDeleteOptions {
  readonly abortSignal?: AbortSignal;
}

export interface SandboxProviderResourceFile {
  readonly content: string | Uint8Array;
  readonly relativePath: string;
}

export interface SandboxProviderResourceTree {
  readonly files: readonly SandboxProviderResourceFile[];
  readonly key: string;
  readonly mountPath: string;
  readonly targetPath: string;
}

export type SandboxProviderResourceSource =
  | { readonly kind: "none" }
  | { readonly key: string; readonly kind: "inline" }
  | { readonly key: string; readonly kind: "materialized"; readonly path: string };

export interface SandboxProviderResources {
  readonly skills?: SandboxProviderResourceTree;
  readonly source: SandboxProviderResourceSource;
  readonly workspace?: SandboxProviderResourceTree;
}

export interface SandboxProviderTargetFile {
  readonly content: string | Uint8Array;
  readonly path: string;
}

export type SandboxPreparedArtifact =
  | null
  | boolean
  | number
  | string
  | readonly SandboxPreparedArtifact[]
  | { readonly [key: string]: SandboxPreparedArtifact };

export interface SandboxProviderFiles {
  list(): Promise<readonly string[]>;
  read(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
}

export interface SandboxProviderHost {
  loadOptionalPackage<T>(input: {
    readonly autoInstall: boolean;
    readonly importModule: () => Promise<T>;
    readonly missingMessage: string;
    readonly packageName: string;
  }): Promise<T>;
  resolveProjectPath(path: string): string;
}

export interface SandboxProviderPrepareContext {
  readonly files: SandboxProviderFiles;
  readonly host: SandboxProviderHost;
  readonly log?: (message: string) => void;
  readonly resources: SandboxProviderResources;
  readonly storagePath: string;
}

export interface SandboxProviderSessionContext {
  readonly host: SandboxProviderHost;
  readonly session: {
    readonly auth: unknown;
    readonly id: string;
    readonly parent?: unknown;
    readonly turn: unknown;
  };
  readonly storagePath: string;
}

export interface SandboxProviderHandle<Session extends SandboxSession = SandboxSession> {
  readonly sandbox: Session;
  onRuntimeShutdown(): Promise<void>;
  onSessionDelete(options?: SandboxDeleteOptions): Promise<void>;
  onSessionStop(): Promise<void>;
}

export interface SandboxProviderImplementation<
  OpenOptions extends object | undefined,
  PreparedArtifact extends SandboxPreparedArtifact,
  SessionState,
  Session extends SandboxSession = SandboxSession,
> {
  prepare(context: SandboxProviderPrepareContext): Promise<PreparedArtifact>;
  resume(
    context: SandboxProviderSessionContext,
    artifact: Readonly<PreparedArtifact>,
    state: Readonly<SessionState>,
  ): Promise<SandboxProviderHandle<Session>>;
  start(
    context: SandboxProviderSessionContext,
    options: Readonly<OpenOptions> | undefined,
    artifact: Readonly<PreparedArtifact>,
  ): Promise<{ readonly handle: SandboxProviderHandle<Session>; readonly state: SessionState }>;
}

type SandboxOptionArguments<Options extends object | undefined> = Options extends undefined
  ? [options?: undefined]
  : Record<never, never> extends Options
    ? [options?: Readonly<Options>]
    : [options: Readonly<Options>];

export type SandboxOpenArguments<Options> = Options extends undefined
  ? []
  : Record<never, never> extends Options
    ? [options?: Options]
    : [options: Options];

export type RuntimeSandboxSessionFor<Session extends SandboxSession> = Session & {
  delete(options?: SandboxDeleteOptions): Promise<void>;
  stop(): Promise<void>;
};

export interface SandboxEnvironment<
  Options extends object | undefined = object,
  Session extends SandboxSession = SandboxSession,
> {
  readonly provider: string;
  open(...args: SandboxOpenArguments<Options>): Promise<RuntimeSandboxSessionFor<Session>>;
}

export type SandboxProviderDefinition<
  EnvironmentOptions extends object | undefined,
  OpenOptions extends object | undefined,
  PreparedArtifact extends SandboxPreparedArtifact,
  SessionState,
  Session extends SandboxSession,
> = {
  readonly name: string;
  environment(
    ...args: SandboxOptionArguments<EnvironmentOptions>
  ): SandboxProviderImplementation<OpenOptions, PreparedArtifact, SessionState, Session>;
};

export interface SandboxProvider<
  EnvironmentOptions extends object | undefined,
  OpenOptions extends object | undefined,
  Session extends SandboxSession,
> {
  readonly name: string;
  environment(
    ...args: SandboxOptionArguments<EnvironmentOptions>
  ): SandboxEnvironment<OpenOptions, Session>;
}

/** Runtime de eve; aquí sólo la firma. */
export declare function defineSandboxProvider<
  EnvironmentOptions extends object | undefined = undefined,
  OpenOptions extends object | undefined = undefined,
  PreparedArtifact extends SandboxPreparedArtifact = SandboxPreparedArtifact,
  SessionState = SandboxPreparedArtifact,
  Session extends SandboxSession = SandboxSession,
>(
  definition: SandboxProviderDefinition<
    EnvironmentOptions,
    OpenOptions,
    PreparedArtifact,
    SessionState,
    Session
  >,
): SandboxProvider<EnvironmentOptions, OpenOptions, Session>;
