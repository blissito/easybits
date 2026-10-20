# AGENTS.md

Instrucciones para agentes de código (formato abierto: https://agents.md).
Las reglas detalladas del proyecto viven en `CLAUDE.md`: léelo también.

## Comandos
- `npm ci` — instalar (la raíz; corre `patch-package` al terminar)
- `npx prisma generate` — generar el cliente de Prisma antes de tipar o probar
- `npx react-router typegen` — generar los `./+types/*` antes de `typecheck`
- `npm run dev` — levantar en local
- `npm run typecheck` — tipos (bloquea el CI)
- `npm run test:run` — pruebas en una pasada (bloquea el CI). `npm test` es watch: no lo uses en CI
- `npm run build` — build (no bloquea el CI). Con 2 GB y 3 GB de heap no terminó en la caja de pruebas (3.9 GB de RAM); en CI corre con 4 GB y, si falla, deja un aviso en el log
- `npm run lint` — hoy no corre: `eslint` no está en `devDependencies` (no bloquea el CI)
- CLI: `cd cli && npm ci && npm test && npm run typecheck` (bloquea el CI, job `cli`)

Antes de abrir un PR, lo que bloquea el CI tiene que pasar en local.

## Arquitectura
- `app/` — la aplicación React Router (rutas, componentes, servicios de servidor).
- `cli/` — el CLI público `@easybits.cloud/cli`, con su propio `package.json` y lockfile.
- `packages/` — paquetes internos del monorepo (SDK, generadores, servicios de sandbox).
- `prisma/` — esquema de Prisma. Dos proveedores: el cliente principal y MongoDB.
- `scripts/` — tareas de build y mantenimiento (docs, skills, etc.).
- `.github/workflows/` — CI y workflows de deploy, backups y mantenimiento.

## Convenciones
- Cambios chicos y con pruebas; un PR por pedido.
- No agregues dependencias sin decirlo en el PR.

## Qué no tocar
- `.github/` (CI y reglas del repo): los cambios ahí los revisa una persona.
- Esquema de Prisma y de MongoDB (`prisma/`): cambiarlo afecta datos reales. Migraciones ya aplicadas no se editan.
- Workflows de deploy y backups (`deploy.yml`, `backup-*.yml`, `purge-cron.yml`, `expire-work-boxes.yml`).
- Secretos y archivos `.env*`: nunca se suben al repo.

## Conocimiento
Fichas cortas en `docs/agents/`: decisiones, trampas y glosario que el código no dice solo.
Léelas antes de tocar su tema; si tu cambio fija una convención o descubres una trampa, escribe o
pon al día la ficha en el mismo PR y agrega aquí su renglón.
- [CI](docs/agents/ci.md) — qué corre cada job, cuáles bloquean y cómo reactivar lo que no bloquea
- [Sentry](docs/agents/sentry.md) — opciones de privacidad (dataCollection), Node mínimo y la trampa de los tests

## Pull requests
- Rama nueva desde `main`; el PR explica qué cambia y cómo se probó.
- El CI tiene que quedar en verde en lo que bloquea.
