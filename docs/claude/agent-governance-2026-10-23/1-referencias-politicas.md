# Referencias: políticas por tool, aprobación humana y bitácora (23-oct-2026)

Sólo referencias leídas, no opinión. Kortix es Elastic-2.0: se toman ideas, no código.
K = `github.com/kortix-ai/suna@dev`.

## 1. Modelo de datos de una regla
- **Kortix** `Policy { match, action, position?, conditions?: [{arg, match, negate?}], conditionsInvalid? }`; `action ∈ always_run | require_approval | block`; `risk ∈ read | write | destructive` (K `apps/api/src/connectors/policy.ts:20-63`). La UI agrega un cuarto estado, **Default** = sin regla, que hereda (K `packages/ui/.../tools/tool-policy-labels.ts:22-57`).
- **Claude Code**: listas `allow` / `ask` / `deny` de cadenas `Tool(especificador)`: `Bash(npm run *)`, `Edit(//secrets/**)`, `WebFetch(domain:*.x.com)`, `mcp__github__get_*` ([permissions](https://code.claude.com/docs/en/permissions)).
- **OpenAI Agents SDK**: `needsApproval: boolean | async (ctx, args) => boolean` en la tool ([human-in-the-loop](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/)).

## 2. Cómo casa una regla con una tool
- **Kortix**: glob `*` sin distinguir mayúsculas, o `/regex/`. Dentro de un alcance gana la **primera** coincidencia por `position` (`policy.ts:296-310`). El alcance proyecto va antes que el del conector y el conector no lo puede anular (`:356-374`). La UI ordena lo exacto antes que los patrones para que un `*` no deje muerta una regla puntual (`tool-policy.ts:90-95`). Las condiciones sobre argumentos usan punto (`message.channel`). Si faltan los args o la condición no se puede evaluar, la regla restrictiva **sí** aplica y la permisiva **no**: nunca falla abierto (`policy.ts:270-293`).
- **Claude Code**: el orden es fijo, **deny → ask → allow**, y lo específico no cambia ese orden. Un `ask` pregunta aunque haya un `allow` más estrecho, y un `allow` no le abre excepción a un `deny`. `Bash(ls:*)` equivale a `Bash(ls *)`. Los parámetros se casan como `Agent(model:*)`, y un parámetro omitido nunca casa.
- **Agent SDK**: hooks → deny → ask → modo → allow → `canUseTool`. Un `deny` aplica incluso en `bypassPermissions` ([agent-sdk/permissions](https://code.claude.com/docs/en/agent-sdk/permissions)).

## 3. Política por defecto
- **Kortix** `default_mode: risk`: leer se ejecuta, escribir o destruir pide aprobación. Un conector marcado `sensitive` pide aprobación hasta para leer. `allow_all` es el modo heredado (`policy.ts:11-14, 313-315, 376-378`).
- **Claude Code**: la lectura dentro del directorio de trabajo no pregunta. Bash, Edit y WebFetch sí preguntan. `dontAsk` convierte cada pregunta en negación.
- **MCP**: las *annotations* (`readOnlyHint`, `destructiveHint`) son pistas no confiables salvo de servidores confiables. El spec dice que **SHOULD** haber un humano capaz de negar ([tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)).

## 4. Cómo se pide y se contesta
- **En el chat (Kortix)**: tarjeta con tres respuestas, `once | always | reject`. Si la petición ya caducó o la contestó alguien más, la tarjeta se reactiva en vez de tronar (K `packages/ui/src/session/tool/inline-permission-reply.ts:1-23`).
- **En un canal (Slack/Teams)**: el botón sólo decide si la sesión del hilo es la misma de la llamada. Decide un manager del proyecto o quien lanzó la sesión. Sin parámetros que revisar, la llamada sólo se puede negar (K `apps/api/src/channels/core/approval-decision.ts:39-43, 75-83, 103-104`).
- **Caducidad (Kortix)**: 24 h por defecto, configurable entre 5 min y 30 días (`approvals.ttl: 30m|4h|7d`). Al caducar sólo cambia el estado y la sesión nunca se reanuda sola (K `apps/api/src/connectors/approval-expiry.ts:12-44`).
- **OpenAI**: la ejecución se pausa y devuelve `result.interruptions`. Se contesta con `state.approve/reject(item, {alwaysApprove})`. El `RunState` se serializa con `toString()` para reanudar después, y la guía advierte que hay que guardarlo del lado del servidor y verificarlo.
- **MCP**: no existe un resultado estándar de «necesita confirmación». Lo más cercano:
  - `elicitation/create`, que se contesta con `accept | decline | cancel` ([elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)).
  - El error `-32042` `URLElicitationRequiredError`.
  - La extensión de Claude Code `_meta["anthropic/requiresUserInteraction"]`, que obliga a preguntar aunque haya un `allow`.
- **Caso propio**: denik regresa un 409 `needs_confirmation` **sin** `isError` (CLAUDE.md de easybits).
- **ChatGPT agent**: pide permiso antes de acciones con consecuencias, como compras ([anuncio](https://openai.com/index/introducing-chatgpt-agent/); el sitio respondió 403 y no se releyó).

## 5. Qué va en la bitácora (Kortix)
- Un evento por decisión: `connector.approval.approved | denied | expired`.
- Campos del evento: `actorUserId`, `actorType` (`human | system`), `source`, `outcome`, `resourceId = correlationId = executionId` y `metadata {action_path, connector_id, decision}` (K `apps/api/src/connectors/call-audit.ts:15-61`).
- El esquema general agrega `initiator_actor_*`, `ip` y `outcome ∈ success | failure | denied | pending | expired` (K `apps/api/src/shared/audit-schema.ts:36-81`).
- La resolución guarda su `source` (`project | connector | risk_default | allow_all`) para explicar por qué se decidió así (`policy.ts:340-344`).

## 6. Cinco reglas para copiar
1. **Riesgo por defecto**: `read` → ejecutar, `write`/`destructive` → preguntar. Un conector `sensitive` pregunta siempre.
2. **Negar gana**: deny → ask → allow, y lo más específico no salta ese orden.
3. **Fallar cerrado**: una condición sin evaluar activa la regla restrictiva y nunca la permisiva.
4. **La aprobación caduca** (24 h, entre 5 min y 30 días), queda atada a la sesión y a quien la lanzó o a un manager, y sin vista previa sólo se puede negar.
5. **Bitácora de cada decisión**: actor, origen (chat o canal), resultado, id de la ejecución, ruta de la tool y la regla o fuente que decidió.
