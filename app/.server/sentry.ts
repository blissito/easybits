let Sentry: { init: (opts: Record<string, unknown>) => void; captureException: (err: unknown) => void };
let initialized = false;

try {
  Sentry = require("@sentry/node");
} catch (err) {
  console.warn("[sentry] @sentry/node no cargó: los errores no se reportan", err);
  Sentry = { init: () => {}, captureException: () => {} };
}

// v11 reemplazó sendDefaultPii por dataCollection y su default es más permisivo.
// Fijamos cada categoría al default de v10 (guía de migración de Sentry, "If you
// want to keep the v10 default behavior"). No dejar dataCollection sin definir.
export function sentryOptions(dsn: string) {
  const scrubbed = { deny: ["forwarded", "-ip", "remote-", "via", "-user"] };
  return {
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: scrubbed, response: scrubbed },
      httpBodies: [],
      urlQueryParams: scrubbed,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    },
  };
}

export function initSentry() {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    Sentry.init(sentryOptions(dsn));
  } catch {
    // Sentry init failed, continue without it
  }

  initialized = true;
}

export { Sentry };
