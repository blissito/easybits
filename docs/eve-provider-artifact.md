# Mejora: estado inmutable + credenciales sólo al abrir (insight de eve #3271)

eve #3271 reemplaza `SandboxBackend` por `defineSandboxProvider({ prepare, start, resume })`:
lo que persiste es un **artifact** (resultado de `prepare`) y un **state** JSON inmutable
(resultado de `start`); `resume(context, artifact, state)` reabre sin re-decidir nada y las
opciones/credenciales viven sólo en `open()`. Nuestro host ya funciona así por dentro; la
mejora es hacerlo explícito en el contrato para que las tres capas (host, adapter, flota)
sean serializables y libres de secretos.

## 1. sandbox-host — el derivado como artifact
Hoy `POST /v1/sandbox/{id}/template-snapshot` devuelve `{derivedId, key, hash, …}` y el
create acepta `derivedTemplate` o `{templateKey, templateHash}`.

- **Artifact** = `{ derivedId, templateVersion, baseTemplate, hash }`. `POST /v1/sandbox`
  acepta `artifact` completo y valida `templateVersion` (409 `DerivedTemplateStale` ya existe);
  así el consumidor guarda un objeto opaco y nunca resuelve por `(key,hash)` en caliente.
- **State** = `{ sandboxId, host }` — ya lo devuelve el create. Nada más entra al estado.
- **Open options** = `env`, `networkPolicy`, `timeoutSeconds`, `suspendOnIdle`… → sólo en
  `POST /v1/sandbox` y en `POST /v1/sandbox/{id}/resume {env}` (feat/create-env ya lo permite).
  Regla que ya cumple el scrub: **un derivado nunca contiene credenciales** (`secret_paths`).
- `GET /v1/sandbox/{id}` devuelve `derivedFrom` → un `resume` puede comprobar que el artifact
  sigue vivo (si el derivado fue GC-eado, 410 `DerivedTemplateGone`, nuevo).

## 2. `@easybits.cloud/eve-sandbox` — provider listo para #3271
Mantener el `SandboxBackend` actual (eve ≤ 0.59) y añadir en el mismo paquete
`easybitsProvider()` con el contrato nuevo, exportado bajo `./provider` para no romper:

- `prepare(input)` → caja temporal + seeds + bootstrap → `template-snapshot {key, hash}` →
  devuelve el **artifact del host** tal cual (JSON). Idempotente por el host.
- `start(context, artifact, options)` → `POST /v1/sandbox { artifact, env: options.env,
  networkPolicy: options.networkPolicy }` → `state = { sandboxId }`. Sin `existingMetadata`:
  el reattach es responsabilidad de `resume`.
- `resume(context, artifact, state)` → `GET /v1/sandbox/{sandboxId}`; suspendida → resume;
  perdida → `start` de nuevo con el mismo artifact (mismo bootstrap, disco nuevo).
- Sesión (run/spawn/files/network) sin cambios: ya es la misma implementación.
- Cuando #3271 mergee: bump mayor, README con las dos formas, y el issue upstream ofrece esto.

## 3. Flota EasyBits — misma separación
`spawnVm` hoy hornea persona + credenciales del motor + `FLEET_TOKEN` en el env del spawn y
guarda sólo `agentId`. Cambiar a:

- **Artifact por FleetAgent** = derivado del host con `hash(workerTemplate, seedFiles, skills,
  templateVersion)`; se guarda en `FleetAgent.metadata.artifact` (JSON opaco). Se re-prepara
  cuando el hash cambia (skills/seeds), nunca cuando cambia el prompt o una credencial.
- **State por caja** = `{ sandboxId, host }` (ya está en `db.agent`).
- **Open options** = todo lo secreto o mutable: `CLAUDE_CODE_OAUTH_TOKEN`/`OPENAI_API_KEY`,
  `FLEET_TOKEN`, `ANTHROPIC_MODEL`, `SYSTEM_PROMPT` → `env` del create y del **resume** (el
  host ya lo reescribe al reanudar). Consecuencia directa: rotar una credencial o cambiar el
  modelo deja de exigir reciclar la caja — basta suspender/reanudar con env nuevo.
- `reserveVm`: al desalojar o adoptar una caja de OTRO agente ya no importa el env horneado
  (se reescribe en el resume) → desbloquea el bug "una cuenta en su techo no puede estrenar un
  agente" sin destruir la VM ajena.

## Orden
1. Host (rama actual): `artifact` en create, 410 `DerivedTemplateGone`, docs. 1 día.
2. Flota: env por resume en `ensureRunning` + artifact por FleetAgent. 1-2 días; medir con
   `place.cold bootMs` y un cambio de modelo sin reciclar.
3. Adapter: `easybitsProvider()` detrás de `./provider`, publicado cuando #3271 mergee.
