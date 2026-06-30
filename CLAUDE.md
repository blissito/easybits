# EasyBits — Agentic-First File Storage

The digital asset platform where AI agents can store, manage, and consume files via SDK and MCP. Built with React Router v7 (ex-Remix), Prisma (MongoDB), Fly.io, and Stripe. **Now accepting paying users** — treat all changes as production-critical.

**Positioning**: Agentic-first file storage. AI agents interact with files through 30+ MCP tools, a typed SDK (`@easybits.cloud/sdk`), and a REST API v2. Webhooks notify external systems of file events in real time.

## Commands
- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run typecheck` — TypeScript check (`tsc --noEmit`)
- `npm test` — run vitest
- `npm run e2e` — Playwright e2e tests

## Project Structure
- `app/routes.ts` — centralized route config
- `app/.server/` — server-only code (DB, auth, pagination, emails)
- `app/components/DashLayout/` — dashboard layout, sidebar, constants
- `app/routes/dash/admin/` — admin panel (users + waitlist)
- `app/routes/dash/developer/` — developer dashboard (API keys, files, providers)
- `prisma/schema.prisma` — data models (MongoDB)

## Key Patterns
- Auth: `getUserOrRedirect(request)` from `~/.server/getters`
- Pagination: helpers in `app/.server/pagination/`, components `PaginatedTable` + `TablePagination`
- Tab layouts: NavLink-based tabs with brutalist styling (see developer/admin layouts)
- Inline mutations: `useFetcher` with `intent` field in POST forms
- API responses: use `data()` from `react-router` (NOT `json()` — deprecated)
- AI generation: ALWAYS use `streamText` + SSE (never `generateText`) — users must see progress in real time
- AI generation cost: ~$1.17 MXN promedio por generación contada (mix 25% generate Sonnet + 75% refine/variant Haiku). `AiGenerationLog` model tracks type/product for analytics
- Generation packs (MXN) — fuente de verdad: `GENERATION_PACKS` en `app/lib/plans.ts` + `PACK_SIZES` en `app/lib/credits.ts`. Precio plano (sin diferenciación por plan); la suscripción ES el descuento. Piso de $5 MXN/gen protege margen vs costo ~$1.17 MXN/gen.

| Pack | Precio | Créditos | $/gen |
|------|--------|----------|-------|
| pack_5 | $39 | 500 | $7.80 |
| pack_10 | $69 | 1,000 | $6.90 |
| pack_50 (featured) | $299 | 5,000 | $5.98 |
| pack_100 | $549 | 10,000 | $5.49 |

## Deploy
- Auto-deploys on push to `main` via GitHub Actions → Fly.io
- Dockerfile uses layer caching (deps cached separately from source)
- Runtime packages MUST be in `dependencies` (not `devDependencies`) — `npm prune --omit=dev` runs in Docker

## MCP architecture (ÚNICA fuente de verdad)
- **Server (fuente única)**: `app/.server/mcp/server.ts` — todas las tools, handlers en `app/.server/mcp/tools/`, grupos en `app/.server/mcp/toolGroups.ts`. Expuesto vía `/api/mcp` (Streamable-HTTP).
- **Proxy npm**: `packages/mcp/` → `@easybits.cloud/mcp` en npm. **NO contiene tools** — solo reenvía stdio JSON-RPC al endpoint HTTP. 210 líneas, transporte puro.
- **Flujo de tool nueva**: añadir en `server.ts` + handler → registrar en `toolGroups.ts` → deploy a Fly. El proxy la recoge automáticamente sin republicar.
- **Republicar `@easybits.cloud/mcp` solo si cambia el proxy** (transport, auth, CLI flags, RC file). Bump de versión NO es necesario para nuevas tools.
- **Debug "no aparece mi tool"**: (1) ¿deployó Fly? `curl -X POST https://www.easybits.cloud/api/mcp -H "Authorization: Bearer <key>" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`. (2) ¿Está en el group allowlist que el cliente usa (design/core/all)? (3) ¿El cliente tiene el conector configurado? (4) **Cache de sesión**: los clientes MCP piden `tools/list` al arrancar la sesión y no la refrescan. Tras un deploy hay que reiniciar Claude Code / abrir chat nuevo en Claude.ai para que aparezcan las tools nuevas.

### Response & error contract (helpers en `app/.server/mcp/responses.ts`)
- **Forma única** para las 158 tools — un agente siempre parsea lo mismo. NO construir `{ content: [...] }` a mano en tools nuevas; usar los helpers:
  - `ok(data)` — éxito (`{ content:[text(JSON)], structuredContent }`).
  - `fail(message, extra?)` — error: `{ error, ...extra }` + `isError:true`. Toda excepción lanzada en un handler ya pasa por `fail()` vía `wrapHandler`, así que lo normal es `throw` y dejar que lo atrape.
  - `failService(e, label)` — mapea errores del catálogo de servicios (créditos/config/provider) a `fail()`; devuelve `null` si no es de servicio (entonces `throw e`).
  - `paginate(items, { nextCursor?, total? })` — envelope ÚNICO de toda lista: `{ items, nextCursor, hasMore, total? }`. `hasMore` se deriva de `nextCursor`. Todo `list_*` devuelve `ok(paginate(...))`. Para listas offset (`list_documents`, `list_websites`) el handler calcula `nextCursor` = siguiente offset.
- **Contract tests**: `test/mcp-contracts.test.ts` congela estas formas (in-process vía `getRegisteredTools(createMcpServer(["all"]))`). Correr `npx vitest run test/mcp-contracts.test.ts` tras tocar la capa MCP.
- **Helpers de cursor en `core/operations.ts`** (`listFiles`/`listShareTokens`/`listWebsiteFiles`/`listDeletedFiles`) ya devuelven `hasMore` — REST API v2 y SDK lo heredan.

## FleetAgent / Flota (fleet elástico de agentes — multi-canal)
- **Qué es**: `app/.server/core/fleetAgentOperations.ts` — un FleetAgent rutea conversaciones a workers efímeros (`claude-worker`) con spawn/suspend/resume/reaper. Agnóstico al canal: `routeMessage(fleetAgentId, {groupId, text, denikApiKey?, appendSystemPrompt?})` toma un `groupId` OPACO y devuelve texto. WhatsApp (Baileys), WABA y **widget web** son entradas distintas al MISMO `routeMessage`.
- **Canal web (HTTP)**: `POST /api/v2/fleet-agents/:id/message` (sync `{reply}`) y `POST /api/v2/fleet-agents/:id/message-stream` (SSE `chunk`/`done`/`error`; `done.value` = reply autoritativo). Auth = `fleetAgent.token` (NUNCA exponer al browser; el tenant proxea desde su server). Sin gate de `enabledGroups` (esa allowlist solo aplica a la superficie Baileys de entrada) → un `groupId` `web-<uuid>` funciona sin registrarlo.
- **Admin WABA via self-chat (coexistencia)**: el dueño administra el agente **mensajeándose a sí mismo** (note-to-self) desde la app de WhatsApp del número WABA. ⚠️ En coexistencia el note-to-self **NO llega como `field:"messages"`** sino como **`field:"smb_message_echoes"`** con `message_echoes[].from === to === tu número`; Formmy YA lo reenvía al droplet (`sender = tu número`, `is_from_me:true`, `manual_mode:true`). EasyBits (`waba.message.ts`) detecta `isAdmin = is_from_me && ((org.admin !== false && sender===org.phoneNumber) || (org.adminSender && sender===org.adminSender))` con `normalizePhone` (MX 521→52) → rutea turno admin ignorando el drop is_from_me/manual_mode. **El self-chat administra POR DEFAULT** (`admin !== false`); la ★ Main por número en `/dash/flota` solo lo apaga. El turno admin inyecta el MCP `admin` (`app/routes/api/v2/fleet-admin.$fleetAgentId.mcp.ts`, espejo de `fleet-render`, 6 tools: list_numbers/set_number_identity/list+set_number_capabilities/set_number_enabled/set_conversation_muted) — requiere `mcp__admin__*` en el allowlist del worker (OVH). Encender/apagar por número (`org.enabled`, número nuevo arranca apagado) + mute por conversación (`org.mutedSenders[]`); turnos admin ignoran ambos gates. Ver memoria `project_waba_admin_via_is_from_me`.
- **Quote/reply WABA (texto)**: el webhook de Meta solo trae `context.id` del mensaje citado, **no su texto**. Resolución 100% en **Formmy** (NO en EasyBits): `webhook.tsx` resuelve `context.id` contra `Message.externalMessageId` (scopeado por conversación) y lo cuela como prefijo `[Responde a: "<excerpt>"]` en `forwardContent` → el droplet/worker lo recibe inline en el `content`, sin campo nuevo ni parsing del lado EasyBits. Mismo patrón que `server/channels/handler.ts`. Quote de **media** (re-hospedar la URL citada) sigue sin soporte.
- **Aislamiento por-tenant**: `denikApiKey` per-mensaje (gana sobre `fleetAgent.groupKeys[groupId]`) scopea el MCP del worker a ese tenant SOLO ese turno.
- **⚠️ El SCOPE de la key denik = el SET de tools, no solo la org**: `@denik.me/mcp` elige tools por el PREFIJO de `DENIK_API_KEY` — `dnk_pub_…` (`IS_PUBLIC_SCOPE`) = **3 tools** (`list_services`/`get_availability`/`create_booking`, para chatbot público de landing); cualquier otra (`dk_…`, admin) = **todas** (`list_customers`/`find_customer`/citas/servicios/org). Síntoma clásico: "el mismo MCP busca contactos en la web pero no en WhatsApp" = la web admin usa `org.apiKey` y el grupo WhatsApp tenía `org.publicApiKey` en `groupKeys[jid]`. Regla denik: **grupo WhatsApp = bot de equipo → admin (`org.apiKey`); burbuja landing = público**. El que provisiona (agenda `whatsapp.link.ts`) decide qué key mete en `groupKeys`; el catálogo curado `denik` (vault) NO aplica a grupos denik (el `denikApiKey` per-turn de `groupKeys` lo sobreescribe en el worker). Ver memoria `project_denik_whatsapp_admin_scope`.
- **Personalización en capas (append, NUNCA overwrite)**: preset `claude_code` (base EasyBits, `provider.ts` siempre appendea) → `persona.env.SYSTEM_PROMPT` del FleetAgent → `appendSystemPrompt` per-mensaje (capa 3 por-org). El worker combina `[cfg.systemPrompt, appendSystemPrompt]` en `systemContext.instructions`.
- **Modelo del worker = FUENTE ÚNICA `FLEET_DEFAULT_MODEL`** (`fleetAgentOperations.ts`, default `claude-sonnet-5`; override por env `FLEET_MODEL` o, por-agente, `persona.env.ANTHROPIC_MODEL`). El worker corre el Agent SDK sin pasar `model` → el CLI honra `ANTHROPIC_MODEL`, que se inyecta UNA vez en el **env del spawn** (`spawnVm`, junto a `FLEET_TOKEN`/OAuth), NO per-mensaje. Aplica a VMs **nuevas/recicladas** — las vivas/suspendidas siguen con su env hasta que el reaper las recicla (sin rebuild del ext4). El proxy de fallback (`claude-sonnet-4-6`) es código MUERTO en la flota (sin `ANTHROPIC_API_KEY` → `FALLBACK_ENABLED=false`). El guardrail `MODEL_IDENTITY_SONNET5` (inyectado fresco por turno como el de voz, SOLO si el modelo resuelto == `claude-sonnet-5`) le dice al agente que ES Sonnet 5 y sus rasgos. **Verificar el modelo real** (no el claim del prompt): mandar un turno pidiendo `echo $ANTHROPIC_MODEL` por Bash. Para forzar una VM fresca: `DELETE /v1/sandbox/:id` en el host (marca el Agent `lost`) → el próximo turno cold-spawnea con el env nuevo.
- **⚠️ Identidad/nombre del bot = DOS campos, no uno**: la persona (`persona.env.SYSTEM_PROMPT` / `ASSISTANT_NAME`) define cómo se presenta el agente, PERO `fleetAgent.assistantName` (columna aparte) es lo que baileys **antepone como prefijo de texto** (`${assistantName}: …`) cuando `hasOwnNumber=false`. `createFleetAgent` hardcodea `assistantName="Ghosty"` → renombrar un asistente exige cambiar AMBOS o el bot dice "Ghosty:" aunque su SYSTEM_PROMPT ya sea otro. Baileys lee ambos FRESCOS de la DB por ráfaga (`baileys.server.ts` L140-145) → cambios aplican al próximo mensaje sin redeploy.
- **`hasOwnNumber` (Prisma `FleetAgent`, default `false`) = estrategia anti-loop + prefijo**: `true` = línea dedicada → detecta sus ecos por `fromMe`, NO antepone nada; `false` = número compartido/personal → antepone `${assistantName}:` (etiqueta + detección de eco, permite que el dueño se autopruebe). NO auto-derivar del pairing (todo pool parea con un número; `false` es config deliberada). Toggle "Número dedicado" por pool en `/dash/flota` (`pools.tsx` intent `toggle-own-number`).
- **⚠️ GOTCHA host proxy `rawBody`**: el host (`sandbox-host internal/api/handlers.go` `agentMessage`) **solo reenvía `{content, sessionId}` de los campos top-level — descarta cualquier extra**. Para que `denikApiKey`/`appendSystemPrompt` (o cualquier campo nuevo del worker) lleguen al microVM hay que mandarlos como **`rawBody`** (passthrough verbatim). Ver `openAgentMessageStream` en `sandboxOperations.ts`. Olvidarlo = el worker no recibe la key → sin MCP, con un cuelgue de ~30-48s (timeout de conexión del MCP).
- **Streaming**: el worker (`templates/claude-worker/src/worker.ts` `runTurn`→`streamTurn`) hace yield incremental bajo lock. Cambios al worker requieren **rebuild del ext4** en el host OVH: `scp` src → `docker build -t localhost/claude-worker:latest .` → `scripts/build_template.sh claude-worker localhost/claude-worker:latest`. Afecta solo VMs nuevas/cold (workers vivos/suspendidos siguen con la imagen previa hasta reciclarse).

### Capacidad: techo honesto + desalojo LRU + cola (NO crear cajas de más)
- **El sueño es por-CAJA (snapshot Firecracker de la VM completa)**, no por-conversación — y así se queda (resume 700-950ms vs cold boot ~12s). `maxWorkersPerVm` cuenta RUTAS pegajosas (conversaciones), NO turnos activos (la RAM la gatea un semáforo in-VM sobre el turno). No confundir las dos capas: placement (rutas/VM) ≠ granularidad de suspend (por-VM).
- **⚠️ Fix de conteo (`spawnVm`)**: el host OMITE las VMs suspendidas de su listing (`GET /v1/sandbox`). Un budget contado solo sobre running/starting REGALABA capacidad y era explotable: llenas, dejas que el reaper duerma las cajas (desaparecen del conteo) y vuelves a spawnear encima → duplicabas el cupo. Ahora `inUse = live + suspended` (las suspendidas se suman desde DB por `ownerId`) → el techo `min(budget, maxVms)` es real. Una VM suspendida ES capacidad reservada (disco + snapshot resume <1s).
- **Desalojo LRU (`reserveVm`)**: al topar el techo, en vez de pasarse, recicla un slot — desaloja la conversación dormida menos-reciente (`PoolRoute.lastMessageAt` asc) de una VM **suspendida** (su memoria ya está en S3 por el backup-al-suspender → re-monta fría ~12s la próxima vez que hable). Solo suspendidas = ociosas y respaldadas, nunca corta un turno en vuelo. Detach = `agentId=null, detachedAt=now` (mismo handle que usa el reaper destroy).
- **Cola, NO rechazo**: si no hay víctima dormida (todo activo de verdad), `reserveVm` relanza `FleetAgentAtCapacity` → el surface (`baileys.server.ts` `drainGroup`) RETIENE el mensaje y reintenta con backoff (`ADMIT_BACKOFFS_MS` 5→30s) hasta `ADMIT_GIVEUP_MS`. El reaper duerme una VM ociosa (`idleSuspendMin=2min` + cadencia 60s) → un reintento posterior la desaloja → se atiende sin reenvío. `ADMIT_GIVEUP_MS=240_000` (~4min) vive POR ENCIMA de `idleSuspendMin+cadencia` a propósito; bajarlo a ≤3min haría que la cola se rinda justo antes de que aparezca la víctima.
- **HUD (`pools.tsx`)**: las cajitas (VMs) ya animan spawn, despertar (stretch pop), dormir (Zzz) y lleno (verde). El desalojo se ve como "poof" del fantasmita dormido (slots envueltos en `AnimatePresence`, exit scale+fade up); el nuevo entra con pop. Reusa el poll de 2.5s, sin canal nuevo.

### Cajas de servicio on-demand (voice + render) — `fleetServiceOperations.ts`
- **Qué es**: capacidades que un FleetAgent necesita pero que NO corren en el worker (audio, Chromium). Una "caja de servicio" es una microVM efímera con UN servicio probado de comunidad dentro. Genérico: `SERVICE_REGISTRY` (kind→spec: `template`, `unit`, `ports`, `readyPaths`, `ttlSeconds`, `idleMin`, `suspendOnIdle`, `hardTtlMin`). Llaveadas **`(ownerId, kind)`** → **UNA caja por user por tipo**, compartida por TODA su flota (todos los grupos/agentes del owner), **en su budget de sandboxes** (`inUse = live + suspended`). On-demand puro: `ensureServiceBox(ctx, kind)` spawnea/resume; el reaper (`reapIdleServiceBoxes`, cadencia 60s) **suspende** a `idleMin` (snapshot caliente, resume ~1s) y **destruye** tras `hardTtlMin` suspendida (libera el snapshot).
- **Lifecycle** (`fleetServiceOperations.ts`): `ensureServiceBox` (idempotente: running→reusa, starting→espera, suspended→`resumeSandbox`+`exposeAll`+`waitReady`, else `spawnServiceBox`). `spawnServiceBox` paso 2 = `startAgent({unit,envFile,port,healthPath})` → el host hace `systemctl enable+restart` de la unit (⚠️ un spawn por API CRUDA del host NO llama `startAgent` → la unit queda dead; siempre entrar por `ensureServiceBox`). `buildUrls(kind,…)` da aliases semánticos (`transcribeUrl`/`speakUrl` para voice, `renderUrl` para render). `touchServiceBox` refresca el reloj idle tras cada uso.
- **voice** (`fleetVoice.ts`): whisper STT (:9000) + kokoro TTS (:9101). `synthesizeVoice`/`synthesizeVoiceFile`/`transcribeAudio`. kokoro-only (sin ElevenLabs/OpenAI; Gemini solo fallback de STT). Voz default `em_santa`. Es **canal-side** (baileys sintetiza desde el texto del agente; el agente NO llama tool).
- **render** (`fleetRender.ts`, SHIPPED 2026-06-28): **Gotenberg (MIT)** en :9300 — HTML/URL→PDF/PNG + screenshots + LibreOffice office→PDF. `renderViaGotenbergBox(ctx,{format,url|html|fileUrl,options})` → multipart a `/forms/chromium/{convert,screenshot}/{url,html}` o `/forms/libreoffice/convert` → `uploadFile` → `{fileId,url}`. A diferencia de voz, un PDF el agente DEBE pedirlo (no se infiere del texto) → se expone como **tool MCP**, no canal-side. Ver memoria `project_fleet_render_gotenberg`.
  - **⚠️ MCP `render` SIEMPRE inyectado (estilo voz, sin toggle)**: ruta `app/routes/api/v2/fleet-render.$fleetAgentId.mcp.ts` (Streamable-HTTP, auth `fleetAgent.token` por header o `?token=`), tools `render_url`/`render_html`/`office_to_pdf`. `fleetAgentOperations.renderMcpServer()` lo mergea INCONDICIONAL sobre `resolveGroupMcpServers` (NO sujeto a `disabledBuiltins`) → funciona aunque el grupo apague el MCP de easybits. "Always-on" = la TOOL siempre ofrecida; la CAJA es 100% on-demand.
  - **⚠️ allowlist del worker**: `mcp__render__*` DEBE estar en `TOOL_ALLOWLIST` de `templates/claude-worker/src/provider.ts` (OVH) o el SDK tira las tools en silencio → rebuild ext4 claude-worker. Allowlist: easybits/wa/denik/brightdata/render.
  - **⚠️ ENV perdido en ext4**: la imagen `gotenberg/gotenberg:8` define sus `*_BIN_PATH` por Docker ENV, que se PIERDE al exportar a ext4 (systemd no lo hereda) → `start.sh` re-exporta TODOS (`CHROMIUM_BIN_PATH`, `LIBREOFFICE_BIN_PATH`, `UNOCONVERTER_BIN_PATH`, `GOTENBERG_VERSIONS_DIR_PATH`, etc.) o Gotenberg muere "CHROMIUM_BIN_PATH not set". Corre como ROOT (Chromium ok bajo root). Template OVH `templates/render-svc/`, memoria 3072 (LibreOffice).
  - **Sitios con Cloudflare** bloquean a Gotenberg (Chromium normal) → fallback futuro = BrightData Scraping Browser (NO `research_scrape`, que devuelve solo HTML). Documentos de EasyBits (Landing v4) NO usan esta caja: siguen en Playwright/Fly (`renderClient.ts`) para conservar optimize/replace de imágenes.
  - **3 motores de render, no mezclar**: facturas/cotizaciones/reportes JSON → `structured_doc`/`@react-pdf/renderer` (sin browser); HTML/URL/office → Gotenberg-caja; `fast_pdf` (Typst) deprecado.
- **service_start/service_status/service_stop** (MCP, server.ts): warm/estado/stop manual de una caja; enum `["voice","render"]`.

## EasyBits DB (libSQL / sqld)
- **Servidor**: `infra/easybits-db/` — Fly app `easybits-db` (región `dfw`). Es la imagen oficial `ghcr.io/tursodatabase/libsql-server:latest` con flags; no hay código propietario.
  - Dockerfile CMD: `sqld --http-listen-addr 0.0.0.0:8080 --admin-listen-addr 0.0.0.0:9090 --db-path /data/sqld --enable-namespaces`
  - **Puertos**: `:8080` = pipeline API (queries), `:9090` = admin API (crear/borrar namespaces). Solo accesibles por red interna Fly.
  - **VM**: `shared-cpu-1x` / 512 MB, scale-to-zero (`min_machines_running=0`, auto start/stop) → ~$0 en idle. Cuello de botella = disco, no CPU/RAM.
  - **Persistencia**: volumen Fly `easybits_db_data` → `/data` (tamaño se fijó al crear con `fly volumes create`; ver con `fly volumes list -a easybits-db`).
  - **Multi-tenant**: un namespace por cliente/recurso vía header `x-namespace` (`--enable-namespaces`).
- **Cliente**: `app/.server/sqld.ts` — thin HTTP client del pipeline API. Lee `SQLD_URL` (:8080) y `SQLD_ADMIN_URL` (:9090). Funciones: `sqldCreateNamespace`, `sqldDeleteNamespace`, `sqldQuery`, `sqldExec`.
- **MCP**: tools `db_create`/`db_query`/`db_list`/`db_exec` consumen este cliente.
- **Clonar sobre sandbox-host**: la arquitectura mapea 1:1 (es sqld puro) — correr el mismo binario `sqld` en microVM Firecracker o en el host KS-5, disco montado en `/data`, exponer `:8080` (y `:9090` solo interno). Decisión pendiente: sqld central (namespaces = tenants, como hoy en Fly) vs sqld por sandbox (DB embebida por microVM, más aislamiento, sin pooling).

## Admin Access
- `ADMIN_EMAILS` env var: comma-separated superuser emails
- `Admin` role in DB: managed from the admin panel itself
- Both grant access to `/dash/admin`

## Webhooks
- Model: `Webhook` in Prisma (url, events[], secret HMAC, status, failCount)
- Engine: `app/.server/webhooks.ts` — fire-and-forget dispatch, HMAC `X-Easybits-Signature`, auto-pause after 5 fails
- Operations: `app/.server/core/webhookOperations.ts` — CRUD
- Events: `file.created`, `file.updated`, `file.deleted`, `file.restored`, `website.created`, `website.deleted`
- API: `GET/POST /api/v2/webhooks`, `GET/PATCH/DELETE /api/v2/webhooks/:id`
- MCP tools: `list_webhooks`, `create_webhook`, `update_webhook`, `delete_webhook`

## Security & Hardening
- Auth: `getUserOrRedirect(request)` — MUST be used on every protected route/endpoint
- API auth: `requireAuth`/`requireScope` from `app/.server/apiAuth` — scope-based (READ, WRITE, DELETE, ADMIN)
- Rate limiting: `app/.server/rateLimiter.ts` — in-memory LRU, `applyRateLimit()` middleware
- CAPTCHA: Turnstile integration (`app/.server/turnstile.ts`)
- Session cookie: must have `secure: true` in production
- Credentials (StorageProvider, AiKey): stored in MongoDB (plaintext — accepted risk, not prioritized)
- CSRF: React Router actions have implicit protection; raw API endpoints need explicit tokens
- Webhook verification: Stripe uses signature verification; other webhooks need HMAC
- **Resolved**: IDOR downloads, endpoint auth, session cookie, Stripe signature verification, asset dedup, DB indexes, share token storage prefix (MCP/private files)
- **File read helper**: `getReadClientForPlatformFile(file)` in `app/.server/storage.ts` — resolves correct prefix (`mcp/` vs root) for platform files. Use instead of `getClientForFile()` when reading file contents.
- **Won't fix**: credentials encryption at rest, persistent rate limiter, storage quota enforcement — accepted as non-critical

## Observability & Health
- Health check: `app/routes/api/health.ts` — checks DB connectivity, returns 200/503
- Sentry: `app/.server/sentry.ts` — lazy init, 10% trace sample rate, `SENTRY_DSN` env var
- Logger: `app/.server/logger.ts` — Winston (JSON format, console + file transports)
- Telemetry: `app/.server/telemetry.ts` — visit tracking with Zod validation
- Error boundary: `app/root.tsx` — catches route errors, optional Sentry capture

## Testing
- Unit: Vitest (`test/` dir) — covers API auth, IAM, storage, Stripe, price validation, MDX, blog
- E2E: Playwright (`test/e2e-purchase.spec.ts`) — purchase flow (WIP)
- **Missing test coverage**: Stripe webhook edge cases, free_subscription, IDOR scenarios

## Presentations
- Editor: `app/routes/dash/presentations/editor.tsx` (textarea HTML/JSON, drag&drop, iframe preview)
- Types & HTML builder: `app/lib/buildRevealHtml.ts` (Slide, SceneObject3D, buildRevealHtml)
- Operations: `app/.server/core/presentationOperations.ts` (CRUD + deploy/unpublish)
- Images: `app/.server/images/pexels.ts` (Pexels stock photos, returns `large` size)
- AI: Haiku 4.5 (outline/3D/variants) + Sonnet 4.6 (HTML slides)
- MCP: 7 tools (list/get/create/update/delete/deploy/unpublish)
- SDK: `@easybits.cloud/sdk` v0.4.0 — presentation methods
- 3D: Three.js v0.170, 5 geometries, 3 animations (float/rotate/none)
- Themes: 11 reveal.js standard themes
- Deploy: static HTML to `slug.easybits.cloud`

## Landings v2
- Editor: `app/routes/dash/landings2/editor.tsx` — block-based, inline editing
- Block components: `app/components/landings2/blocks/` — 18 block types with visual variants
- Generation: `app/routes/api/v2/landing2-generate.ts` — **streaming SSE** (streamText + NDJSON parsing)
- AI: Haiku 4.5 generates blocks, each streamed to editor as it completes
- Images: hero/imageText blocks auto-enriched with Pexels stock photos (non-blocking, via `block-update` SSE event)
- Block variants: features (cards/cards-icon/bordered/minimal), stats (big-numbers/cards/inline), testimonials (cards/quote-large), FAQ (accordion/two-col), pricing (cards/table), team (grid/cards), gallery (grid/masonry), timeline (vertical/horizontal/steps)
- `BlockEditor` supports `onChange?: undefined` for read-only mode during streaming
- CSS animation `animate-fade-in` + auto-scroll to latest block during generation

## Landings v3
- Editor: `app/routes/dash/landings3/editor.tsx` — canvas-based, iframe preview, floating toolbar
- Canvas/FloatingToolbar/CodeEditor: local files re-export from `@easybits.cloud/html-tailwind-generator` SDK
- Canvas: iframe with injected HTML, click-to-select, shimmer image placeholders, Cmd+Z forwarding to parent
- FloatingToolbar: AI prompt, ✦ Variante, tag switcher, size presets (padding/margin/width/text/font-weight/rounded), color swatches, delete element, attr editing. **Class replacement is parent-side** (computes new className from `selection.className` + prefix filter, then `setAttribute('class')`) — NOT iframe-side
- SectionList: sidebar with theme picker, reorder, delete, double-click rename
- CodeEditor: CodeMirror 6, flash highlight, format, Cmd+S save
- Generation: `app/routes/api/v2/landing3-generate.ts` — **Sonnet 4.6**, streaming SSE, NDJSON brace-depth parser
- Refine: `app/routes/api/v2/landing3-refine.ts` — **Haiku 4.5** (Sonnet for vision), streaming SSE, element-level or section-level
- Types: `app/lib/landing3/types.ts` — Section3, IframeMessage, CustomColors
- Themes: `app/lib/landing3/themes.ts` — semantic color system (primary/secondary/accent/surface), multi-color custom picker
- Build: `app/lib/landing3/buildHtml.ts` — assembles full HTML with Tailwind CDN + theme CSS
- Images: auto-enriched via `data-image-query` attr → Pexels (`app/.server/images/enrichImages.ts`)
- Deploy: static HTML to `slug.easybits.cloud` via `deployLanding` in `app/.server/core/landingOperations.ts`
- Key differences from v2: free-form HTML sections (not block schema), iframe canvas (not React components), semantic color tokens, CodeMirror code editor

## Documents
- Editor: `app/routes/dash/documents/editor.tsx` — GrapesJS-based editor (landings4 `GrapesEditor`)
- New doc flow: `app/routes/dash/documents/new.tsx` → `directions.tsx` (4 design directions) → editor with `?generating=1`
- Model: reuses `Landing` with `version: 4`, stored in `landing.sections` as Section3[]
- **Parallel generation** (SDK `generateDocumentParallel`): Phase 1 outline (`generateObject`, fast model ~1s) → Phase 2 N pages in parallel (`streamText` × N, ~8-10s) → Phase 3 sequential image enrichment (Pexels)
- **Streaming preview**: During full generation, a lightweight iframe replaces GrapesJS for smooth real-time rendering. GrapesJS mounts only after generation completes.
- API: `/api/v2/document-generate` (SSE: `outline` → `section-building` × N interleaved → `section` × N → `section-update` for images → `done`)
- Directions: `/api/v2/document-directions` — 4 design directions (fonts, colors, mood)
- AI models: ALL Gemini — configured in DB `AppConfig` key `ai-models` + code defaults in `app/.server/aiModels.ts`
- Themes: reuses landings3 semantic color system (`buildSingleThemeCss`)
- Logo: data URL uploaded to Tigris CDN, passed to AI as `<img src>` instruction
- Export PDF: server-side Playwright via `/api/v2/documents/:id/pdf` (`takeDocumentPdf` in `app/.server/core/documentScreenshot.ts`). Respects `metadata.format` regardless of user's printer. Supports `?sections=id1,id2` subset.
- Export PNG (social carousels): server-side Playwright via `/api/v2/documents/:id/images` (`exportDocumentImages`). One public PNG per page, uploaded to Tigris. Editor shows "Exportar N PNG" button only when `metadata.intent === "social"`.
- `metadata.intent`: auto-detected from format ratio on import — `"social"` (1:1, 4:5, 9:16), `"presentation"` (16:9, 4:3), `"document"` (letter/fallback). Drives editor CTAs.
- `metadata.customColors`: derived from source palette on import via `normalizeHexColors` roleMap. Forces `theme: "custom"` in `createDocument`. Before Apr 2026 this was discarded and imports fell back to the user's brand kit.
- PageList: `app/components/documents/PageList.tsx` — thumbnails via scaled-down iframes, drag-and-drop reorder, version navigation, image drop zones

### Document Editor Limitations (GrapesJS)

| Área | Limitación | Causa | Workaround |
|---|---|---|---|
| Regenerar página | Sin preview en tiempo real | GrapesJS no soporta hot-swap de HTML parcial — resultado se aplica al final del streaming | Usuario ve spinner, resultado aparece completo |
| Refine elemento | Matching frágil por string | `openTag` del DOM puede diferir del HTML guardado (GrapesJS modifica attrs) | Fallback: refine de página completa |
| Clases desde sidebar | Requiere `sidebar:change` event | `component:update` se dispara en init de GrapesJS y corrompe datos si se usa como interaction flag | Custom event `sidebar:change` emitido por `writeClasses` |
| Thumbnails | Re-render lento en docs grandes | Cada thumbnail es un iframe con Tailwind CDN que debe cargar | Aceptable para <20 páginas |
| Generación completa | Editor no disponible | iframe de streaming reemplaza GrapesJS durante generación | GrapesJS carga automáticamente al terminar |
| Overflow de páginas | AI genera contenido que excede 11in | Prompts lo prohíben pero AI lo ignora a veces | Refine pidiendo "reduce contenido" o dividir |
| `__grapes_css__` | Sección fantasma con CSS de GrapesJS | `grapesToSections` extrae `<style>` como sección especial | Filtrada en PageList, deploy, y listado |

## Cert Management
- Audit + cleanup: `app/.server/core/certOperations.ts` — compares Fly certs vs DB (websites, customDomains, users)
- Cron: `GET /api/cron/purge-certs` — runs in `.github/workflows/purge-cron.yml` alongside purge-files (every 7 days)
- Admin UI: `/dash/admin/certs` — view valid/orphaned/protected, bulk delete orphans
- Protected hostnames: easybits.cloud, www.easybits.cloud, easybits.fly.dev (never deleted)

## Brand: logo animado (wordmark "EasyBits" — efecto FlipLetters)

El logo de la marca = **icono de ojitos + wordmark "EasyBits" animado**. Aparece en el sidebar (`app/components/DashLayout/SideBar.tsx`) y en el nav de login (`app/components/login/auth-nav.tsx`). Cualquier agente que necesite "el logo animado de easybits" debe reusar ESTO (no reinventarlo, no usar un gif):

- **Icono (ojitos):** `/logo-purple.svg` (público) — también `/icons/eyes-logo-purple.svg`. Estático.
- **Animación del wordmark:** componente `app/components/animated/FlipLetters.tsx` (usa `motion/react`: `useAnimate` + `stagger`). Es un **efecto dominó 3D**: dos capas de las mismas letras superpuestas (`perspective: 1000px; transform-style: preserve-3d`); **al hover**, la capa de enfrente voltea hacia arriba (`rotateX: 90deg, y: -40%`) y la de atrás entra (`rotateX: 0`), **staggered 0.05s por letra, duración 0.3s** (`{ duration: 0.3, delay: stagger(0.05) }`). En reposo: front en `rotateX:0`, back en `rotateX:90` (de canto). Variante `type="light"` = texto negro (para fondos claros).
- **Fuente:** `"Jersey 10"` (Google Font). Import en `app/app.css`: `@import url("https://fonts.googleapis.com/css2?family=Jersey+10&display=swap")`; clase `.font-jersey { font-family: "Jersey 10", serif; }`.

**Transportarlo a HTML plano / contextos sin React (ej. páginas servidas por un box):** usar **Motion One** (`motion` vanilla, misma familia) por CDN — `import { animate, stagger } from "https://cdn.jsdelivr.net/npm/motion@11/+esm"` — y replicar el flip con dos `<div>` de `<span>` por letra + los mismos keyframes (`rotateX`, `y`, `stagger(0.05)`, `duration 0.3`). **Implementación de referencia ya hecha** en `sandbox-host/templates/livekit-svc/room.html` (el estudio de grabación): copiar de ahí el bloque CSS (`#ebWord`/`.ebRow`/`.font-jersey`), el markup (ojitos + dos `.ebRow`) y el `<script type="module">` con Motion One.
