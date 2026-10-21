---
# Entorno de la caja de trabajo y de la preview de cada PR (Software Factory de Ghosty).
setup:
  services: [mongo]
  db: easybits
  # El build de Vite llega a ~3.2 GB de heap: con 4 GB y @check corriendo pruebas moría por OOM.
  memory: 8gb
  env:
    EB_BACKGROUND: "off"
    JWT_SECRET: test-jwt-secret
    SECRET: test-secret
smoke: [/login]
---
Convenciones de este repo que deben saber @plan, @build y @check:

- Base: Prisma con `provider = "mongodb"` y SIN migraciones. La caja levanta Mongo como réplica de un
  nodo (`seed-mongo`, Prisma no escribe sin replica set) y da `DATABASE_URL` a una base local vacía.
  Nunca apuntar a la base de producción.
- Pruebas: `npx react-router typegen && npm run typecheck`, `npm run check:docs`, `npm run check:skills`
  y `npx vitest run` (lo mismo que `verify` en `.github/workflows/deploy.yml`). Los tests de `cli/` son
  `node:test`: `cd cli && npm test`.
- Build: `npm run build` (corre antes `prebuild`: docs-sync y skills-pack). Vite necesita ~3 GB de heap;
  con 2 GB muere por OOM. Por eso la caja pide `memory: 8gb`: la fábrica le da a Node ~6 GB de heap sola
  (no hace falta `NODE_OPTIONS` en las variables de la preview).
- Arranque: `npm start` (`node server.mjs ./build/server/index.js`). Con `EB_BACKGROUND=off` no toma el
  lease de líder: no levanta WhatsApp ni el reaper (en una preview no deben correr).
- Las llaves de terceros (Stripe, S3, Anthropic, sandbox-host…) NO van en la preview: la app arranca sin
  ellas y esas funciones fallan solas. Sólo valores desechables.
