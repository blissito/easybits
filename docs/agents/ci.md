# CI (`.github/workflows/ci.yml`)

Qué corre en cada job y si bloquea el PR. Lo que no bloquea sale en el CI igual, marcado con
`continue-on-error` y su motivo junto al paso.

| Job | Corre | Bloquea | Cuándo |
|---|---|---|---|
| `verify` | `prisma generate`, `react-router typegen`, `typecheck`, `test:run` | sí | PR y push a `main` |
| `verify` · `lint` | `npm run lint` | no | `eslint` no está en `devDependencies`; sale 127 |
| `verify` · `build` | `npm run build` | no | en la caja de pruebas no termina con 2 GB ni con 3 GB de heap; con 4 GB no se probó |
| `cli` | `npm ci`, `npm test`, `npm run typecheck` en `cli/` (Node 22) | sí | PR y push a `main` |
| `security` | gitleaks y dependency-review (severidad alta) | sí | sólo PR |
| `docker` | `docker build` sin push | sí | sólo PR, 20 min |

## Cómo reactivar lo que no bloquea
- `lint`: agregar `eslint` y su config a la raíz, probar en local, quitar `continue-on-error`.
- `build`: subir la memoria del runner o bajar el consumo del build; luego quitar `continue-on-error`.

## Trampas
- `npm test` en la raíz es vitest en **watch**: en CI va `npm run test:run`.
- El CLI usa Node 22 (`engines.node >=22`). No copiar el 20 de `publish-packages.yml`.
- `gitleaks-action` va siempre en GitHub, no en la caja de trabajo: asume `/home/runner`.
