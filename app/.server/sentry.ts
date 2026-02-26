let Sentry: { init: (opts: Record<string, unknown>) => void; captureException: (err: unknown) => void };
let initialized = false;

try {
  Sentry = require("@sentry/node");
} catch {
  Sentry = { init: () => {}, captureException: () => {} };
}

export function initSentry() {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: 0.1,
    });
  } catch {
    // Sentry init failed, continue without it
  }

  initialized = true;
}

export { Sentry };
