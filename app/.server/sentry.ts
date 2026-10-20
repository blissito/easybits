let Sentry: { init: (opts: Record<string, unknown>) => void; captureException: (err: unknown) => void };
let initialized = false;

try {
  Sentry = require("@sentry/node");
} catch (err) {
  console.warn("[sentry] @sentry/node no cargó: los errores no se reportan", err);
  Sentry = { init: () => {}, captureException: () => {} };
}

// v11 reemplazó sendDefaultPii por dataCollection: sin este bloque userInfo,
// cookies y headers se mandan a Sentry. Esto preserva el default de v10.
export function sentryOptions(dsn: string) {
  return {
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
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
