# Cajas ACP (ghosty-lite / goose) desde el snapshot dorado — para que EasyBits lo adopte

> Escrito desde gs el 2026-10-06. gs ya lo usa con MiniGhosty; aquí está lo necesario para que
> EasyBits haga lo mismo **por su cuenta**, sin depender de gs.

## Qué es y cuánto ahorra

El daemon de sandbox-host guarda **un dorado por template**: una caja sin secretos, con el runtime
apagado, pausada y con snapshot. Un clon carga ese `.mem` con MAP_PRIVATE y los discos por reflink,
y en **~0.3 s** tienes la VM lista. Hoy `createAgent` con `protocol: "acp"` hace un `createSandbox` en
frío: ~12 s antes del `agent/start`.

Estado en el daemon (6-oct): `SANDBOX_GOLDEN=1` y
`SANDBOX_GOLDEN_TEMPLATES=claude-worker,ws-ci-runner,ghosty-lite`, **sólo en el fierro B** (XFS). En A
(ext4) no hay dorado. Para sumar `goose` hay que agregarlo a esa lista en B y reiniciar el daemon.

⚠️ Sólo clonan los pools **por template** (`deferRuntime: true`). Tus pools por agente y tus `create`
siguen igual que hoy: agregar el template a la lista no cambia nada de EasyBits hasta que declares tu pool.

## Cómo lo hace gs (para copiarlo)

1. **Declarar un pool por template**, con un dueño de casa propio (no el de gs, que es `ghosty-golden`):

   ```
   POST /v1/warmpool
   { "key": "eb-golden:ghosty-lite:2048", "template": "ghosty-lite", "env": {},
     "count": 1, "hotCount": 1, "memoryMb": 2048, "vcpus": 2,
     "owner": "<owner de casa de EasyBits>", "deferRuntime": true }
   ```

   Unit, env file, puerto y health salen del template (`ghosty-lite-runtime`, `/etc/ghosty-lite-runtime/.env`,
   3000, `/health`). Una sola forma (memoria/vcpus) por template: otra rehornea el dorado encima del de gs.
   Re-declararlo si el claim da 404.

2. **Reclamar en vez de crear** (en `createAgent` y en `ensureAgentBox`):

   ```
   POST /v1/warmpool/claim
   { "key": "eb-golden:ghosty-lite:2048", "owner": "<ObjectId del dueño>",
     "env": { …el spawnEnv del agente… }, "noFallback": true,
     "metadata": { …tus etiquetas… } }
   ```

   El daemon escribe el env, arranca el runtime, espera el health y cambia el dueño. `metadata`
   (desde `5d5c9eb`) etiqueta la caja; no puede pisar `ip`, `bootPath`, `eb_*`, `placement*` ni `domain*`.
   Comprueba con un `GET` que la etiqueta quedó: con un daemon viejo, destrúyela y ve en frío.

3. **Después del claim**: la caja nace encendida y sin siesta. Ponle la de ACP con
   `POST /v1/sandbox/<id>/idle` (`suspendOnIdle`, `idleTtlSeconds: ACP_IDLE_SECONDS`,
   `hardTtlSeconds: ACP_HARD_TTL_SECONDS`). Luego, igual que hoy: sembrar archivos y skills,
   `agent/start` si cambiaste algo que el cerebro lee al boot, `expose` y el dominio fijo.

4. **Sin spare** (`503 NoWarmSpare` / `CapacityReached`) → el `createSandbox` de siempre. El dorado
   es un atajo, nunca un requisito.

Referencia en gs: `app/lib/runtime/acp-box.server.ts` → `claimGoldenAcpBox`, y
`app/lib/runtime/fleet.server.ts` → `ensureGoldenPools` / `claimGoldenBox`.

## Cuidado

- Un spare encendido son 2 GB de B. Empieza con `count: 1`.
- Si tus cajas ACP deben vivir en A, el dorado no aplica. Para que el claim caiga en B, el pool debe
  declararse en B.
- Un cambio de binario del daemon que cambie las opciones de arranque invalida el dorado. El pool lo
  rehornea solo (~3 s) al pedir spare.
