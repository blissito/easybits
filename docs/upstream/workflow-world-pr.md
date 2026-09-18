# PR para vercel/workflow — `docs: add EasyBits to community Worlds`

Requisitos del repo (verificados en PRs recientes: Eveland #4069 mergeó en 2 días):
- Sólo `worlds-manifest.json` + changeset vacío (`pnpm changeset --empty`).
- Commit con DCO (`git commit -s`) y **firmado GPG** desde la cuenta de bliss (Eveland tuvo que rehacerlo).
- `jq empty worlds-manifest.json`, `node scripts/create-community-worlds-matrix.mjs`, `git diff --check`, links en 200.
- Comentar `@vercel/workflow` cuando esté listo. Revisan @VaguelySerious (lo instala y prueba) y @pranaygp (mergea).

## Entrada para `worlds-manifest.json` (append al array `worlds`)

```json
{
  "id": "easybits",
  "type": "community",
  "package": "@easybits.cloud/eve-world",
  "name": "EasyBits",
  "description": "libSQL/sqld World hosted on EasyBits DB (multi-tenant namespaces); a port of world-postgres with a lease-based delivery queue in a table. Made for self-hosted eve servers running in EasyBits boxes, where the database URL is provisioned without credentials.",
  "repository": "https://github.com/blissito/easybits/tree/main/packages/eve-world",
  "docs": "https://www.easybits.cloud/en/docs/eve.md",
  "features": [],
  "env": {
    "WORKFLOW_TARGET_WORLD": "@easybits.cloud/eve-world",
    "WORKFLOW_LIBSQL_URL": "file:workflow.db"
  },
  "services": [],
  "requiresCredentials": true,
  "credentialsNote": "Hosted mode needs an EasyBits box (the DB URL is injected by the platform). Outside EasyBits, point WORKFLOW_LIBSQL_URL (+ WORKFLOW_LIBSQL_AUTH_TOKEN) at any libSQL/Turso database."
}
```

## Description

Adds `@easybits.cloud/eve-world` to `worlds-manifest.json` as a community World. It is a 1:1 port of `@workflow/world-postgres@5.0.0-beta.44` to `@libsql/client` + Drizzle SQLite, with graphile-worker replaced by a polling queue table with per-message leases. Targets `@workflow/world@5.0.0-beta.35` (the line eve 0.58/0.59 pins) and mints **specVersion 7**. Not implemented (optional in the contract): `events.createBatch`, `queueBatch`, `runs.cancelMany`, analytics.

Links: npm https://www.npmjs.com/package/@easybits.cloud/eve-world · source (above) · docs (above) · example: https://www.easybits.cloud/blog/agentes-eve-en-easybits?lang=en

## How did you test your changes?

- `jq empty worlds-manifest.json`; `node scripts/create-community-worlds-matrix.mjs` (entry excluded from the CI matrix by `requiresCredentials`, like Jazz/Upstash); `git diff --check`; all links return 200.
- World: 15 unit tests against `file:`; production run through a real eve app: 8-step workflow, server box destroyed mid-step 2, new box on the same database resumed at step 3 after 59 s, run completed, no duplicated steps, stream and hooks delivered.

## Checklist
- [x] `pnpm changeset --empty` (manifest-only)
- [x] DCO sign-off and GPG-signed commit
- [ ] comment `@vercel/workflow` when ready

## Pendiente antes de mandarlo
- Añadir un `README` con la tabla de env al paquete (ya existe) y confirmar que `npm i @easybits.cloud/eve-world` en un proyecto Workflow 5.0-beta limpio arranca con `file:workflow.db` (modo local, sin EasyBits) — @VaguelySerious lo va a instalar.
- Decidir si el nombre del paquete les molesta (pidieron a Rivet quitar "vercel"; "eve-world" no lleva marca de ellos, debería pasar).
