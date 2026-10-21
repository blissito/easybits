# Dependencias

Lo que aprendimos al subir paquetes. Léelo antes de tocar el lock, los tipos de sharp o los paquetes de @blocknote.

## Los peers no se instalan solos
`.npmrc` tiene `legacy-peer-deps=true`, así que npm no instala los peer dependencies. `@blocknote/core` 0.56 declara `y-prosemirror` como peer: sin ella en `package.json`, el import de `@blocknote/core/dist/yjs.js` falla (la prueba `spike-collab-broker-node` lo muestra). Por eso `y-prosemirror` va como dependencia directa. Al subir `@blocknote/*`, revisa sus `peerDependencies` en el lock y agrega las que la app usa.

## sharp 0.35 cambió sus tipos
- `sharp.Color` ya no resuelve como namespace (TS2503 en `scripts/pad-brand-logos.ts`): usa un tipo local.
- `FormatEnum` sólo tiene `jpeg`, no `jpg`. El metadata de sharp devuelve `jpeg`, así que el mapeo `jpg → jpeg` no hacía nada.

## La familia react-router sube junta
`.github/dependabot.yml` tiene un grupo `react-router` (`@react-router/*`, `react-router`, `react-router-dom`). Así las subidas de la familia llegan en un solo PR.

## Verificar
`npx tsc --noEmit` y `npx vitest run`: son los pasos de `verify` que bloquean el CI (ver [CI](ci.md)).
