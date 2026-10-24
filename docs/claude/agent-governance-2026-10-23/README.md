# Gobierno de agentes: reglas por herramienta, aprobaciones, bitácora y memoria (23-oct-2026)

Cuatro investigaciones en paralelo:

1. [Referencias de políticas](1-referencias-politicas.md): Kortix, Claude Code, OpenAI y MCP.
2. Mapa de EasyBits (abajo).
3. [Referencias para Ghosty Studio](3-referencias-ghosty-studio.md): bandeja de aprobaciones en el celular y memoria compartida.
4. Mapa de Ghosty Studio (abajo).

## 2 · Lo que EasyBits ya tiene (mapa del código)

- **Ya hay ocho mecanismos** que limitan o confirman lo que hace un agente de la flota:
  - `TOOL_ALLOWLIST`, el hook `PreToolUse` y el perfil `mcp-only` en el worker.
  - `disabledBuiltins` y `groupConfigs.toolDeny` en la app.
  - Los grupos `?tools=` del MCP.
  - Las anotaciones readOnly/destructive en `toolAnnotations.ts`.
  - Los turnos admin de WABA.
  - `AgentAction` con `needs_confirmation` y el evento `permission` del copilot.
  - El 409 de Denik.
  - Ninguno es una regla por herramienta y por agente.
- **El patrón de aprobación ya existe y está probado** en `app/.server/core/agentActions.ts`:
  - Lo que se propone se guarda en base.
  - Sólo se aprueba con sesión, nunca con llave.
  - Caduca a los 15 min y un doble clic no lo corre dos veces.
  - Está amarrado a 6 tools de cron.
- **Hueco que decide el diseño:** el shell del worker ve `EASYBITS_API_KEY`, `FLEET_TOKEN` y `DENIK_API_KEY`. Por eso `?tools=` y `toolDeny` son una guía para el modelo, no una frontera.
- **Diseño en dos capas con las mismas reglas:**
  - **Worker, hook `PreToolUse`:** es el único punto que ve todas las llamadas, incluidas las de MCP de terceros. `deny` bloquea y `ask` se responde como «espera aprobación».
  - **App, handlers propios:** aquí se aplica de verdad. Funciona como `AgentAction` generalizado, con `fleetAgentId`, `groupId` y `turnId`.
  - **Dónde viven las reglas:** en `groupConfigs[cfgId].toolRules`, con herencia de `*`.
  - **Reglas por default:** salen de `toolAnnotations` (readOnly → allow, destructive → ask).
  - **Bitácora:** una fila por decisión en el `onTool` de `routeMessage`, para que cubra todos los canales.
- **Canal de la aprobación según la conversación:**
  - Sitios y copilots: interrupción AG-UI.
  - Widget: evento SSE.
  - WABA: número admin.
  - WhatsApp QR: grupo principal.
  - Teams: `input-required` de A2A.

## 4 · Lo que Ghosty Studio ya tiene (mapa del código)

- **Aprobación:**
  - Ya existe: `RISKY_TOOLS` y `approvalGate` en `app/lib/agents/tool-approvals.server.ts`, y el punto único es `runToolAs`.
  - Sólo funciona con alguien mirando el turno: vive en memoria y espera 10 min.
  - No hay tabla de pendientes ni bandeja.
  - **Bug:** el morning brief agenda turnos con `permisos:"preguntar"` que nadie contesta.
- **Inserción de la bandeja:** un cuarto resultado, «encolar», en `approvalGate`. Guarda la llamada exacta en una tabla nueva `PendingAction`, avisa con el push `permission` que ya existe y, al aprobar, la corre una vez y despierta el hilo.
- **Memoria:**
  - Hoy hay dos capas: por persona (`Memory`) y por agente (`AgentNote`).
  - No hay memoria de empresa, aunque GTeams ya la tiene (`gt_agent_memory` con `scope_key='ws'`).
  - **Inserción:** `WorkspaceNote` por `workspaceId`, inyectada en `startTurn` junto a `notesPrefixFor`.
