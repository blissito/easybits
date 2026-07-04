# Agregar un cerebro (provider) a la flota

Un **cerebro** (worker template) es el runtime que corre DENTRO de la microVM del
FleetAgent y responde los mensajes. El edge de EasyBits es **agnóstico al cerebro**:
convierte media→texto, mantiene el `sessionId` sticky por conversación, y habla un
contrato de transporte. Cualquier runtime que cumpla el contrato se enchufa cambiando
`FleetAgent.workerTemplate`.

Este doc es el runbook para agregar un proveedor nuevo (DeepSeek, OpenAI, Gemini,
local, …). Hay **dos caminos de integración**; elige uno.

---

## Los dos contratos

### Camino A — nativo `/message` (SSE token/done/error)  ⭐ el más simple
El edge hace `POST {port}{messagePath}` directo a tu runtime dentro de la VM.
Contrato canónico completo: [`claude-worker-contract.md`](./claude-worker-contract.md).
Resumen:

- **Endpoint**: `POST :3000/message` (defaults; override en `template.json` →
  `agent:{protocol,port,message_path,unit,health_path}`).
- **Request**: `{ content: string, sessionId: string, appendSystemPrompt?, toolGroup?,
  mcpServers?, disabledBuiltins?, denikApiKey? }`.
- **Response**: `text/event-stream`, cada evento `data: <json>\n\n`, **solo**:
  ```
  data: {"type":"token","value":"…"}
  data: {"type":"done"}
  data: {"type":"error","message":"…"}
  ```
- Un proceso por `sessionId`; transcript/resume en `/data`.
- Úsalo cuando escribes el runtime desde cero (p.ej. un provider con su propio SDK).
  Referencia: `sandbox-host/templates/claude-worker`.

### Camino B — `/v1/threads` detrás del adaptador `server.js`  (linaje CodeWhale)
El template `rust-ghosty` ya trae un **adaptador Node (`server.js`)** que:
1. Expone al edge el contrato del Camino A (`:3000/message` → SSE token/done/error),
   además de WhatsApp/Baileys, voz, y el MCP `wa` de entrega de archivos.
2. Le habla a TU cerebro en `:7878` con el **contrato CodeWhale `/v1/threads`**.

Así, un cerebro que implemente `/v1/threads` **hereda gratis** todo el adaptador
(media, voz, WA, comandos `/compact` `/clear`). Es el camino de `codewhale` y de
`ghostycode`. Contrato (verificado contra `ghosty serve --http`):

**Endpoints** (bearer `DEEPSEEK_RUNTIME_TOKEN` / `--auth-token` en `/v1/*`):

| Método | Ruta | Request | Response |
|---|---|---|---|
| `POST` | `/v1/threads` | `{system_prompt, model, mode:"agent", auto_approve:true}` | `{id, ...}` (el adaptador lee `id`\|`thread_id`) |
| `GET`  | `/v1/threads/{id}` | — | `{latest_turn_id, ...}` |
| `POST` | `/v1/threads/{id}/turns` | `{prompt}` | `{turn:{id}, thread:{latest_turn_id}}` (lee `id`\|`turn_id`\|`turn.id`) |
| `POST` | `/v1/threads/{id}/turns/{turnId}/interrupt` | — | libera un turno colgado |
| `POST` | `/v1/threads/{id}/turns/{turnId}/cancel` | — | cierra el turno |
| `POST` | `/v1/threads/{id}/compact` | `{}` | comprime el contexto |
| `GET`  | `/v1/threads/{id}/events?since_seq=N` | — | **SSE** de eventos (ver abajo) |
| `GET`  | `/health` | — | `{status:"ok", ...}` |

**Eventos SSE** (`/events`): cada línea `data: <json>` con envelope
`{ seq:number, turn_id, event, payload }`. El adaptador consume:
- `event:"item.delta"` con `payload:{kind:"agent_message", delta:"…"}` → texto incremental.
- `event:"turn.completed"` con `payload:{usage:{input_tokens, output_tokens,
  prompt_cache_hit_tokens, reasoning_tokens}}` → fin del turno + costo.
- `event:"turn.failed"|"turn.interrupted"|"turn.canceled"` → fin.
- `event:"item.failed"` → una tool falló, el turno CONTINÚA (no parar).
- El cursor `since_seq` evita re-emitir deltas de turnos previos; filtra por `turn_id`.

> El adaptador es defensivo con nombres de campo (`id`\|`thread_id`,
> `id`\|`turn_id`\|`turn.id`), así que variaciones menores calzan. Lo que NO puede
> variar es el vocabulario de eventos (`item.delta`/`turn.completed` + `kind:"agent_message"`).

---

## Registrar el cerebro en EasyBits (ambos caminos)

La espina de selección → provisioning ya existe. Para un cerebro nuevo `mi-brain`:

1. **Enum de templates** — `app/.server/sandbox/schemas.ts`: agrega `"mi-brain"` a
   `SANDBOX_TEMPLATES` (actualiza el tipo `SandboxTemplate` y los enums Zod).
2. **Inyección de secretos** — `app/.server/core/sandboxOperations.ts` → `createAgent`,
   bloque por template (~L2110-2199). Mira los de `rust-ghosty`/`cagent-ghosty`/`ghosty-gc`:
   ```ts
   if (params.template === "mi-brain") {
     if (!env.MI_PROVIDER_API_KEY) {
       const k = await getSecretValue(ctx.user.id, "MI_PROVIDER_API_KEY").catch(() => null);
       if (k) env.MI_PROVIDER_API_KEY = k;
     }
   }
   ```
   Los secretos salen del **vault por-usuario** (`getSecretValue`), no de `process.env`.
   `createSandbox` reenvía `env` verbatim a la VM (no filtra).
3. **Selector del form** — `app/routes/dash/fleet-agents.tsx` → constante `BRAINS`:
   agrega `{ value: "mi-brain", label: "Mi Provider" }`. Si el cerebro NO usa OAuth de
   Claude, el require de OAuth ya se relaja para `workerTemplate !== "claude-worker"`
   (ver el handler `intent==="create"`).
4. **Env que SIEMPRE inyecta el edge** (léelo en tu runtime):
   `ADMIN_TOKEN` (bearer de `/admin/*`), `TZ`, `FLEET_TOKEN` + `FLEET_WA_ACTION_URL`
   (para las acciones WhatsApp de vuelta), y lo que ponga el dueño en `persona.env`
   (OAuth/branding). Secretos de provider vía el bloque de `createAgent` (paso 2).

## Registrar el template en el sandbox-host (Dockerfile → ext4)

El sandbox-host NO usa imágenes de un registry en runtime: `scripts/build_template.sh`
toma una **imagen docker LOCAL** (construida en el host desde el Dockerfile del template)
y la convierte a un **rootfs ext4** para el microVM Firecracker. Los brains propios se
**buildan desde fuente** en su Dockerfile (como `claude-worker`: `COPY src` + `npm build`);
NO se publica nada a Docker Hub. Para un cerebro nuevo:

1. Crea `sandbox-host/templates/mi-brain/` con `Dockerfile` + start script + `runtime.yaml`
   (marker que `build_template.sh` lee → emite el systemd unit con `exec_start`).
   - **Camino A**: el Dockerfile buildea tu runtime desde fuente; escucha `:3000/message`.
   - **Camino B**: reutiliza el patrón `rust-ghosty` (server.js adaptador + tu binario en
     `:7878` sirviendo `/v1/threads`; siembra `~/.<provider>/mcp.json` + `config.toml`).
     Si tu brain es Rust propio, buildéalo a una imagen LOCAL (`docker build -t mi-brain-bin
     <repo>`) y en el template `COPY --from=mi-brain-bin /usr/local/bin/...` — sin registry.
2. En el host: `docker build -t mi-brain:latest templates/mi-brain` →
   `build_template.sh mi-brain mi-brain:latest` → `/var/lib/sandbox-host/templates/mi-brain.ext4`.
3. Registra `mi-brain` en el catálogo del host (`listTemplates`/`resolveTemplate`); si
   declara `requiredEnv`, `validateRequiredEnv` falla el spawn cuando falte ese env.

---

## Acciones WhatsApp de vuelta (`wa` MCP)  — común a ambos caminos

Para mandar mensajes/archivos/encuestas/reacciones/ubicación al chat, el cerebro llama
`POST {FLEET_WA_ACTION_URL}` con `Authorization: Bearer {FLEET_TOKEN}` y body
`{ sessionId, action, args }` → `{ ok, result?, error? }`. Acciones: `send_message`
`{text?,url?,caption?,fileName?,reply_to_last?}`, `send_poll`, `react_message`,
`send_location`, `get_invite_link`, y (solo grupo main) `list_groups`/`set_group_key`.
En el Camino B esto ya lo expone `server.js` como MCP `wa` en `~/.<provider>/mcp.json`.

## Checklist mínimo

**Camino A (nativo):**
- [ ] `POST :3000/message {content,sessionId}` → SSE `token`/`done`/`error`.
- [ ] Un proceso por `sessionId`; `.jsonl`/resume en `/data`; sobrevive suspend/resume.
- [ ] Lee credencial del provider de `env`; (opc) `health_path`.
- [ ] Registro EasyBits (enum + createAgent + BRAINS) + imagen en sandbox-host.

**Camino B (`/v1/threads` + server.js):**
- [ ] Binario sirve `/v1/threads`, `/turns`, `/interrupt`, `/cancel`, `/compact`,
      `/events?since_seq=N` (SSE con `item.delta`/`turn.completed`).
- [ ] Auth bearer por `--auth-token`/`<PROVIDER>_RUNTIME_TOKEN`.
- [ ] Template reusa `server.js` (siembra mcp.json + config); binario en `:7878`.
- [ ] Registro EasyBits (enum + createAgent + BRAINS) + imagen en sandbox-host.

## Ejemplo vivo: `ghosty-gc` = ghostycode (cerebro propio)
Camino B. `ghosty serve --http --port 7878` implementa `/v1/threads` (verificado
wire-compatible con CodeWhale; `runtime_api.rs`). Template `sandbox-host/templates/ghosty-gc`
(Dockerfile `COPY --from=ghcr.io/blissito/ghostycode:latest` + server.js adaptador).
LLM por el **proxy medido de EasyBits** (`config.toml` `provider="easybits"`, la api_key
es el `EASYBITS_API_KEY` del dueño → gasto en su plan); fallback DeepSeek BYOK si hay
`DEEPSEEK_API_KEY`. Auth `/v1/*` = `DEEPSEEK_RUNTIME_TOKEN`. Ya en `SANDBOX_TEMPLATES` +
bloque `createAgent` (`sandboxOperations.ts` ~L2179). Selector `BRAINS` → "Ghosty propio (ghostycode)".
(`rust-ghosty` es el ancestro con brain CodeWhale de terceros; `ghosty-gc` lo reemplaza con el propio.)
