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

## 2. `@easybits.cloud/eve-sandbox` — provider para #3271 (IMPLEMENTADO, `./provider`)
Contrato REAL del PR (rama `spike/dockerfile-sandbox-local`, commit `61efc255`), distinto de lo
que suponía este doc antes:
- `prepare(ctx)` NO recibe bootstrap ni key/hash: recibe `ctx.resources` (workspace/skills con
  `targetPath`), `ctx.files` y `ctx.log`. El setup del usuario es la opción `prepare(sandbox)`
  del `environment()`. Nuestro `prepare` = caja temporal + recursos en `/workspace` y
  `$HOME/.agents/skills` + `prepare(sandbox)` → **plantilla derivada** (`templateSnapshot`,
  key `eve:<resources.source.key>`, hash = template + keys de recursos + `prepare.toString()`).
  Artifact = `{ derivedId, key, hash, template, version }`.
- `start(ctx, options, artifact)` → `{ handle, state }`; `create({templateKey, templateHash})`
  + `env` (a `/etc/profile.d`) + `networkPolicy`; state = `{ sandboxId, sessionName, generation, version }`.
- `resume(ctx, artifact, state)` → sólo handle. eve dicta FALLAR si el estado nativo se perdió;
  implementamos `recreateOnLoss` (default true) que re-crea desde el artifact; `false` lanza.
- Handle = `{ sandbox, onSessionStop, onRuntimeShutdown, onSessionDelete }` (no stop/shutdown/delete).
- `SandboxTemplateNotProvisionedError` lleva `providerName`; se exporta desde `eve/sandbox/provider`.
- Medido (`scripts/smoke-provider.ts`): prepare 8.2 s (derivado 12 MB), prepare#2 0.3 s reusado,
  start 5.0 s, suspend+resume 4.9 s misma caja, delete OK.
- No cubierto aún: `ctx.files` (Dockerfile), montajes `/eve/resources`, `transform`/`forwardURL`,
  y el `env` de `open()` se pierde si `resume` tuvo que re-crear.

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
