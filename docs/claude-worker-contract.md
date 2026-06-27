# Contrato: `claude-worker` (runtime de VM del FleetAgent)

Este es el contrato que debe cumplir el template **`claude-worker`** para enchufar al
FleetAgent manager de EasyBits (`app/.server/core/fleetAgentOperations.ts`). Es **intercambiable
con `ghosty-gc`** — mismo contrato de transporte.

## Jerarquía (verdad — no la mezcles)
- **VM** (`sandboxId`) = microVM Firecracker. EasyBits la levanta/suspende/rutea.
  Hospeda **N workers**. En la DB es el row `Agent`.
- **Worker** = **un proceso por conversación**, identificado por un `sessionId` (UUID).
  **1 conversación = 1 worker = 1 transcript `.jsonl`.** Un worker NUNCA atiende más
  de una conversación.
- Cuando una VM llega a `maxWorkersPerVm` (default 8), el FleetAgent levanta **otra VM**.

El FleetAgent orquesta VMs (spawn/suspend/route). **Tú construyes el runtime que corre
DENTRO de la VM y que levanta un worker por cada `sessionId` nuevo.**

---

## 1. Cómo lo spawnea EasyBits

`createAgent(ctx, { template: "claude-worker", env, name, seedFiles })`
(`app/.server/core/sandboxOperations.ts`). El host arranca la microVM y luego
`startAgent` lanza el runtime con `env`. El runtime debe quedar escuchando HTTP
**dentro de la VM** (EasyBits llega vía el proxy del host, no directo).

Metadata que EasyBits registra al crear (defaults — el template puede sobrescribir
en su manifest `template.json` → `agent: { protocol, port, message_path, unit, health_path }`):

| Campo        | Default        | Significado                                  |
|--------------|----------------|----------------------------------------------|
| `protocol`   | `sse`          | El worker emite Server-Sent Events           |
| `port`       | `3000`         | Puerto HTTP dentro de la VM                   |
| `messagePath`| `/message`     | Ruta del endpoint de mensajes                 |
| `unit`       | `chat-runtime` | systemd unit                                  |
| `health_path`| (opcional)     | readiness; si se define, EasyBits lo poletea  |

> Usa los defaults (`sse` / `3000` / `/message`) salvo razón fuerte — es el camino
> ya probado por `chat-runtime`.

## 2. Env inyectado (lo que el worker debe leer)

EasyBits inyecta SIEMPRE:
- `ADMIN_TOKEN` — bearer para endpoints `/admin/*` del runtime (= `embedToken`).
- `TZ` — zona horaria (default `America/Mexico_City`).

Del **FleetAgent** (`fleet agent.persona.env`, lo pega el dueño al crear su fleet agent) — aquí viene
lo importante para tu caso OAuth Max:
- **El OAuth del dueño** (su cuenta Claude Max) → el worker lo usa como credencial
  del Agent SDK. Nombre de la var: **defínelo tú** y documéntalo (sugerido
  `CLAUDE_CODE_OAUTH_TOKEN` o `ANTHROPIC_OAUTH_TOKEN`); EasyBits lo pasa verbatim
  desde `persona.env`, no lo interpreta.
- Cualquier branding/persona (system prompt, nombre del agente, brand kit) que el
  dueño configure — también llega por `persona.env` / `seedFiles`.
- `EASYBITS_API_KEY` (opcional pero recomendado) → para que el worker use MCP /
  `upload_file` de EasyBits (archivos a S3, DBs turso). Si tu bloque en `createAgent`
  lo mintea como hace `ghosty-gc`, queda always-on.

> **Acción para el builder:** agrega un bloque `if (params.template === "claude-worker")`
> en `createAgent` (junto al de `ghosty-gc`, ~línea 1881) que resuelva el OAuth del
> vault del dueño (`getSecretValue`) si no viene en `env`, y registra `"claude-worker"`
> en el type `SandboxTemplate` + en el manifest de templates del host.

## 3. Endpoint de mensajes (LO CRÍTICO)

El host hace `POST {port}{messagePath}` a la VM con JSON:

```json
{ "content": "string", "sessionId": "uuid-v4-string" }
```

- `content`: el mensaje del usuario (el FleetAgent ya le antepone `[sender]` y, si hay
  adjunto, una línea `(adjunto: <url>)`).
- `sessionId`: **UUID estable por conversación**. El mismo UUID llega en cada turno
  de ese grupo → úsalo como handle de `--resume` y como key del transcript `.jsonl`.

**Respuesta: SSE** (`Content-Type: text/event-stream`), eventos separados por `\n\n`,
cada uno `data: <json>`. El runtime debe emitir EXACTAMENTE este shape:

```
data: {"type":"token","value":"Hola"}

data: {"type":"token","value":" mundo"}

data: {"type":"done"}
```

En error:
```
data: {"type":"error","message":"motivo"}
```

> EasyBits traduce `token`→`chunk` aguas abajo (`mapSSETokenToChunk`). Tú emite
> `token` / `done` / `error`. NO emitas otro formato (ni OpenAI deltas ni `[DONE]`).

## 4. Un worker por conversación + resume nativo

- Al llegar un `sessionId` **nuevo** → arranca un **worker dedicado** (proceso/sesión
  del Agent SDK con `--resume <sessionId>`). Si el `sessionId` ya tiene worker →
  enrútalo a ese. **NO multiplexes conversaciones en un solo proceso.**
- Varios `sessionId` simultáneos = varios workers vivos en la misma VM, concurrentes
  (limitados por los vCPU de la VM). El FleetAgent nunca manda más de `maxWorkersPerVm` a
  una VM.
- El estado de resume es el transcript del Agent SDK:
  `~/.claude/projects/<proj>/<sessionId>.jsonl`. Mismo `sessionId` ⇒ mismo transcript
  ⇒ `--resume` reconstruye contexto + auto-compact gratis.
- Escribe los `.jsonl` en el **volumen persistente** de la VM (p. ej. bajo `/data`).
  El FleetAgent usa suspend/resume (snapshot) → el disco se preserva → resume sobrevive la
  ventana idle sin nada extra.
- **Fase 2 (no para el POC):** montar cada `.jsonl` desde un volumen externo → VMs
  100% desechables/intercambiables. Por ahora vive en disco de la VM y basta.

## 5. Archivos

- Entrante (media de WhatsApp): el FleetAgent te pasa una **URL** en `content`
  (`(adjunto: <url>)`), no bytes. Descárgala tú si la necesitas.
- Saliente (lo que el agente genere): súbelo a EasyBits con `upload_file` (MCP, con
  `EASYBITS_API_KEY`) y devuelve la **URL** en tu texto de respuesta. El FleetAgent/Baileys
  la manda al grupo. Disco local de la VM = scratch.

## 6. Lifecycle (lo maneja EasyBits, solo para que lo sepas)

- **Spawn**: `createAgent` → status `building` → `running` cuando aceptas mensajes.
  Si defines `health_path`, EasyBits lo poletea; si no, confía en el exit de `startAgent`.
- **Suspend**: tras `idleSuspendMin` sin mensajes → `POST /v1/sandbox/:id/suspend`
  (snapshot). Tu proceso se congela; no necesitas hacer nada.
- **Resume**: al llegar mensaje a un grupo sticky → `POST /v1/sandbox/:id/resume`.
  Debes volver a estar listo para recibir en `{port}{messagePath}` sin re-setup.

## 7. Checklist mínimo para que enchufe

- [ ] HTTP server en `:3000`, `POST /message` acepta `{content, sessionId}`.
- [ ] Responde SSE `{type:"token"|"done"|"error"}`, eventos `\n\n`.
- [ ] **Un worker (proceso) por `sessionId`** — nuevo sessionId → nuevo worker; existente → reusa. No multiplexar en un proceso.
- [ ] `sessionId` (UUID) → `.jsonl` por conversación, en `/data` (persistente).
- [ ] Varios workers concurrentes en la misma VM.
- [ ] Lee OAuth del dueño desde `env` (nombre de var documentado), compartido por los workers de la VM.
- [ ] Sobrevive suspend/resume sin re-setup.
- [ ] (Opcional) `health_path` para readiness.
- [ ] Registrar `"claude-worker"` en `SandboxTemplate` + manifest de templates + bloque env en `createAgent`.
