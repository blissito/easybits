# CI (`.github/workflows/ci.yml`)

Qué corre en cada job y si bloquea el PR. Lo que no bloquea sale en el CI igual, marcado con
`continue-on-error` y su motivo junto al paso.

| Job | Corre | Bloquea | Cuándo |
|---|---|---|---|
| `verify` | `prisma generate`, `react-router typegen`, `typecheck`, `test:run` | sí | PR y push a `main` |
| `verify` · `lint` | `npm run lint` | no | `eslint` no está en `devDependencies`; sale 127. Si falla, el log trae el aviso «npm run lint falló» |
| `verify` · `build` | `npm run build` (4 GB de heap) | no | en la caja de pruebas no terminó con 2 GB ni con 3 GB. Como no bloquea, el job sale verde aunque falle: busca el aviso «npm run build falló» |
| `cli` | `npm ci`, `npm test`, `npm run typecheck` en `cli/` (Node 22) | sí | PR y push a `main` |
| `security` · gitleaks | gitleaks | sí | sólo PR |
| `security` · dependency-review | dependency-review (severidad alta) | no | el repo no tiene el grafo de dependencias activo; sale en rojo con «Dependency review is not supported» |
| `docker` | `docker build` sin push | sí | sólo PR, 20 min |

## Cómo reactivar lo que no bloquea
- `lint`: agregar `eslint` y su config a la raíz, probar en local, quitar `continue-on-error`.
- `build`: confirmar en un run que el paso pasa con 4 GB (sin aviso); luego quitar `continue-on-error` y el aviso.
- `dependency-review`: activar Settings → Code security → Dependency graph; luego quitar su `continue-on-error`.

## Trampas
- `npm test` en la raíz es vitest en **watch**: en CI va `npm run test:run`.
- El CLI usa Node 22 (`engines.node >=22`). No copiar el 20 de `publish-packages.yml`.
- `Publish CLI` (`publish-packages.yml`) tiene su propio `setup-node` 22; el 20 del job sirve a SDK, MCP y eve-sandbox.
- La app compila en ~11 s (`npm run build`, medido en caja de 4 GB con `NODE_OPTIONS=--max-old-space-size=3072`). La preview puede tardar en arrancar por la cola de cajas: esa espera no es de build.
- `gitleaks-action` va siempre en GitHub, no en la caja de trabajo: asume `/home/runner`.
