// Registro de MOTORES de la flota — fuente única para "qué modelo corre Ghosty".
//
// Un FleetAgent siempre ES Ghosty; lo que cambia es el motor (proveedor + template
// del worker + credencial). Antes esto vivía disperso en 3 ejes crudos del form
// (workerTemplate + persona.env.GHOSTY_LLM + oauthSecretName); aquí se unifica en
// UNA decisión. Agregar un modelo nuevo = un renglón en FLEET_ENGINES.
//
// El PROVEEDOR siempre es seleccionable; la disponibilidad vive a nivel MODELO
// (`EngineModel.ready`). Los modelos que aún no implementamos se muestran como
// opciones DISABLED ("próximamente") dentro del select. Un proveedor sin ningún
// modelo listo (Codex/GLM hasta Fase 2) se puede elegir pero no crear.
//
// DATO PURO: sin imports de ~/.server para poder importarse en el bundle de cliente
// (el form lo lee). Ver feedback_server_import_in_client_breaks_build.
//
// La credencial se resuelve por CONVENCIÓN DE NOMBRE (el `Secret` no tiene columna
// de tipo): el spawn lee la key del vault por su nombre canónico
// (getSecretValue(user, secret.name)). Solo `kind:"oauth"` se persiste en el
// FleetAgent (oauthSecretName); las `apiKey` las resuelve el spawn por nombre.

export type FleetEngineSecret = {
  /** Nombre canónico en el vault (= nombre de la env var que el worker espera). */
  name: string;
  /** oauth → se guarda en FleetAgent.oauthSecretName; apiKey → la resuelve el spawn. */
  kind: "oauth" | "apiKey";
  /** Placeholder del input cuando el form pide la key faltante. */
  placeholder?: string;
};

export type EngineModel = {
  id: string;
  label: string;
  /** false = aún no implementado → opción DISABLED en el select ("próximamente"). */
  ready?: boolean;
};

export type FleetEngine = {
  id: string;
  /** Etiqueta en el picker (siempre "Ghosty · <proveedor>"). */
  label: string;
  /** Subtítulo corto del card (modelos representativos). */
  model: string;
  provider: string;
  /** → FleetAgent.workerTemplate (SandboxTemplate). */
  template: string;
  /** Env extra mergeado en persona.env (p.ej. GHOSTY_LLM para ghosty-gc). */
  env?: Record<string, string>;
  /**
   * Env var que porta el modelo elegido → persona.env (ANTHROPIC_MODEL / CODEX_MODEL).
   * Editable después de crear (misma env var). Los proveedores ghosty-gc
   * (deepseek/glm/easybits) NO lo usan: su modelo es fijo por el worker (el
   * proveedor lo elige GHOSTY_LLM) → sin modelEnv, el `models` es informativo.
   */
  modelEnv?: string;
  /** Modelos del proveedor. Siempre ≥1 (los de modelo fijo traen un solo elemento). */
  models: EngineModel[];
  /** Modelo preseleccionado (debe ser uno `ready`). */
  defaultModel?: string;
  /** null = motor sin credencial (proxy medido de EasyBits). */
  secret?: FleetEngineSecret | null;
};

export const FLEET_ENGINES: FleetEngine[] = [
  {
    id: "claude",
    label: "Ghosty · Claude",
    model: "Opus · Fable · Sonnet",
    provider: "anthropic",
    template: "claude-worker",
    // El spawn lee ANTHROPIC_MODEL de persona.env (gana sobre FLEET_DEFAULT_MODEL).
    modelEnv: "ANTHROPIC_MODEL",
    // Haiku queda fuera: es el tier rápido, poco confiable en multi-tool + code-mode.
    models: [
      { id: "claude-opus-4-8", label: "Opus 4.8 (tope)" },
      { id: "claude-fable-5", label: "Fable 5" },
      { id: "claude-sonnet-5", label: "Sonnet 5 (balance)" },
    ],
    defaultModel: "claude-sonnet-5",
    secret: { name: "CLAUDE_CODE_OAUTH_TOKEN", kind: "oauth", placeholder: "sk-ant-oat..." },
  },
  {
    id: "deepseek",
    label: "Ghosty · DeepSeek",
    model: "deepseek-chat",
    provider: "deepseek",
    template: "ghosty-gc",
    env: { GHOSTY_LLM: "deepseek" },
    // Modelo fijo por el worker (GHOSTY_LLM ya elige el proveedor) → sin modelEnv.
    models: [{ id: "deepseek-chat", label: "deepseek-chat (fijo)" }],
    secret: { name: "DEEPSEEK_API_KEY", kind: "apiKey", placeholder: "sk-..." },
  },
  {
    id: "easybits",
    label: "Ghosty · EasyBits (medido)",
    model: "proxy",
    provider: "easybits",
    template: "ghosty-gc",
    env: { GHOSTY_LLM: "easybits" },
    models: [{ id: "proxy", label: "proxy medido (fijo)" }],
    secret: null,
  },
  {
    id: "glm",
    label: "Ghosty · GLM",
    model: "GLM 5.2",
    provider: "zhipu",
    template: "ghosty-gc",
    env: { GHOSTY_LLM: "glm" },
    // ghostycode YA soporta GLM, pero el worker ghosty-gc horneado en el host aún
    // no está actualizado + falta la rama de inyección de key → Fase 2 (modelo not ready).
    models: [{ id: "glm-5.2", label: "GLM 5.2", ready: false }],
    secret: { name: "GLM_API_KEY", kind: "apiKey", placeholder: "..." },
  },
  {
    id: "codex",
    label: "Ghosty · Codex",
    model: "Sol · Terra · Luna",
    provider: "openai",
    template: "codex-worker",
    // El worker codex-worker se hornea en el host OVH (Fase 2) → todos los modelos
    // not ready (opciones disabled). Seleccionable como proveedor, no creable aún.
    modelEnv: "CODEX_MODEL",
    models: [
      { id: "gpt-5.6-sol", label: "Sol (tope)", ready: false },
      { id: "gpt-5.6-terra", label: "Terra (balance)", ready: false },
      { id: "gpt-5.6-luna", label: "Luna (rápido)", ready: false },
    ],
    defaultModel: "gpt-5.6-sol",
    secret: { name: "CODEX_API_KEY", kind: "apiKey", placeholder: "sk-..." },
  },
];

export const DEFAULT_ENGINE_ID = "claude";

export const getEngine = (id?: string): FleetEngine | undefined =>
  FLEET_ENGINES.find((e) => e.id === id);

/** ¿El proveedor tiene al menos un modelo listo? (si no, se puede elegir pero no crear). */
export const engineCreatable = (e: FleetEngine): boolean =>
  e.models.some((m) => m.ready !== false);

/**
 * Motor con MODELO SELECCIONABLE para un workerTemplate dado (tiene modelEnv). Para
 * editar el modelo de un agente existente. Los proveedores ghosty-gc (deepseek/glm/
 * easybits) comparten template y NO tienen modelEnv (modelo fijo) → undefined, sin
 * selector. claude-worker → claude; codex-worker → codex. Único por template.
 */
export const getEngineByTemplate = (template?: string): FleetEngine | undefined =>
  FLEET_ENGINES.find((e) => e.template === template && !!e.modelEnv);
