# Sentry (`app/.server/sentry.ts`)

Qué decide el código y por qué. Versión: `@sentry/node` 11.

- **Privacidad.** v11 reemplazó `sendDefaultPii` por `dataCollection`. Sin ese bloque el SDK manda `userInfo`
  (incluida la IP), cookies y headers sin filtrar. Las opciones viven en `sentryOptions()`: ahí se cambia la privacidad,
  no en `initSentry()`.
- **Node.** `@sentry/node` 11 exige Node >=20.19.0. El Dockerfile fija `node:20.19-slim` en sus tres etapas; no volver a
  un tag flotante `node:20-slim`. `test/sentry.test.ts` lo vigila.
- **Si no carga.** Si `require("@sentry/node")` falla, se avisa con `console.warn` y Sentry queda como no-op. Sin ese aviso
  el fallo es silencioso.
- **Trampa de tests.** `test/setup.ts` reemplaza `process` por un objeto plano; con eso `Sentry.init` lanza
  `process.on is not a function`, y `initSentry` lo traga en el `catch`. Por eso la prueba valida `sentryOptions()` y no
  el cliente real.
