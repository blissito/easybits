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

## Pool / Flota (fleet elástico de agentes — multi-canal)
- **Qué es**: `app/.server/core/poolOperations.ts` — un pool rutea conversaciones a workers efímeros (`claude-worker`) con spawn/suspend/resume/reaper. Agnóstico al canal: `routeMessage(poolId, {groupId, text, denikApiKey?, appendSystemPrompt?})` toma un `groupId` OPACO y devuelve texto. WhatsApp (Baileys), WABA y **widget web** son entradas distintas al MISMO `routeMessage`.
- **Canal web (HTTP)**: `POST /api/v2/pool/:id/message` (sync `{reply}`) y `POST /api/v2/pool/:id/message-stream` (SSE `chunk`/`done`/`error`; `done.value` = reply autoritativo). Auth = `pool.token` (NUNCA exponer al browser; el tenant proxea desde su server). Sin gate de `enabledGroups` (esa allowlist solo aplica a la superficie Baileys de entrada) → un `groupId` `web-<uuid>` funciona sin registrarlo.
- **Aislamiento por-tenant**: `denikApiKey` per-mensaje (gana sobre `pool.groupKeys[groupId]`) scopea el MCP del worker a ese tenant SOLO ese turno.
- **Personalización en capas (append, NUNCA overwrite)**: preset `claude_code` (base EasyBits, `provider.ts` siempre appendea) → `persona.env.SYSTEM_PROMPT` del pool → `appendSystemPrompt` per-mensaje (capa 3 por-org). El worker combina `[cfg.systemPrompt, appendSystemPrompt]` en `systemContext.instructions`.
- **⚠️ GOTCHA host proxy `rawBody`**: el host (`sandbox-host internal/api/handlers.go` `agentMessage`) **solo reenvía `{content, sessionId}` de los campos top-level — descarta cualquier extra**. Para que `denikApiKey`/`appendSystemPrompt` (o cualquier campo nuevo del worker) lleguen al microVM hay que mandarlos como **`rawBody`** (passthrough verbatim). Ver `openAgentMessageStream` en `sandboxOperations.ts`. Olvidarlo = el worker no recibe la key → sin MCP, con un cuelgue de ~30-48s (timeout de conexión del MCP).
- **Streaming**: el worker (`templates/claude-worker/src/worker.ts` `runTurn`→`streamTurn`) hace yield incremental bajo lock. Cambios al worker requieren **rebuild del ext4** en el host OVH: `scp` src → `docker build -t localhost/claude-worker:latest .` → `scripts/build_template.sh claude-worker localhost/claude-worker:latest`. Afecta solo VMs nuevas/cold (workers vivos/suspendidos siguen con la imagen previa hasta reciclarse).

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

## Presentations Roadmap (ordered by priority)
1. **P0 — Editor inline (TipTap)**: Replace textarea with rich text editor. TipTap + ProseMirror, output HTML compatible with reveal.js. New `app/components/presentations/SlideEditor.tsx`
2. **P1 — Slide layouts**: 8 pro layouts (Title, Title+Body, Two Column, Image+Text, Image Full, Quote, Stats, Comparison). `app/lib/slideLayouts.ts`. AI suggests layout in outline
3. **P2 — Image sources**: Improve Pexels (3-5 results), add IconScout API (we have account), Unsplash. AI image gen (DALL-E/FLUX/RunPod) — evaluate later
4. **P2 — Custom themes**: 5 EasyBits themes (brutalist, neon, corporate, minimal, glassmorphism) + custom colors/font. `app/lib/presentationThemes.ts`
5. **P2 — 3D enhanced**: More geometries (cone, torusKnot, etc), animations (pulse, bounce, orbit), predefined scenes, GLTF models
6. **P3 — Short-banners**: Vertical 9:16 estilo PostMyWall, modelo Banner propio, editor dedicado `app/routes/dash/banners/`, video export (Remotion/FFmpeg/Creatomate)
7. **P3 — Slide transitions**: Reveal.js transitions (fade, convex, concave, zoom), per-slide or global
8. **P3 — Drag & drop**: Upgrade to `@dnd-kit/core` (low priority)
9. **P3 — Evaluate generation model**: 4o-mini vs Sonnet for HTML slides (low priority, Sonnet works well)

## Vision: Forms + DBs + Actions — EasyBits como mini-backend

**Objetivo**: Que las landings/documentos publicados en EasyBits tengan backend funcional sin que el usuario escriba código. Forms que guardan datos, acciones que se ejecutan server-side, y DBs consultables por agentes.

### Flujo completo
```
Usuario crea DB "leads" (schema: nombre, email, teléfono)
     ↓
En el editor, conecta un <form> a esa DB + configura acciones
     ↓
Visitante llena form en landing publicada
     ↓
POST /api/v2/forms/:landingId/submit (público, rate-limited)
     ↓
Pipeline de acciones (configurada por usuario o agente):
  → db_insert: guarda row en DB "leads"
  → send_email: notifica al dueño
  → webhook: dispara a Slack/n8n/Make
  → create_file: genera PDF con los datos
```

### Modelo de datos
- **FormPipeline**: `landingId`, `trigger: "form_submit"`, `actions[]`
- **Action types** (built-in, extensibles):
  - `db_insert` — inserta en DB del usuario con field mapping
  - `send_email` — email con template configurable
  - `webhook` — POST a URL externa
  - `create_file` — genera archivo en EasyBits storage
- **Field mapping**: conecta campos del form → columnas de la DB (`{ "nombre": "field_name", "email": "field_email" }`)

### Piezas existentes que se reutilizan
- DBs del usuario: MCP tools `db_create`, `db_query`, `db_list`, `db_exec` ya existen
- Webhooks engine: `app/.server/webhooks.ts` — fire-and-forget + HMAC
- Email infra: `app/.server/emails/`
- Nuevo evento webhook: `form.submitted` (payload: formId, data, landingName)

### Fases de implementación
1. **Endpoint submit + FormSubmission model + webhook `form.submitted`** — poco código, el usuario conecta automatizaciones externas
2. **Actions built-in** — `db_insert` + `send_email`. El form funciona end-to-end sin nada externo
3. **UI en editor** — seleccionar form → panel "Acciones al enviar" → agregar/quitar actions
4. **MCP tools** — `list_form_submissions`, `create_form_action`, `list_form_actions`
5. **Actions marketplace** — la comunidad o agentes crean plugins custom

### Diferenciador
EasyBits se convierte en hosting + DB + forms + actions — un mini Firebase/Supabase controlado por agentes. El usuario publica una landing y ya tiene backend funcional.

## TODOs & Technical Debt
- **REVISAR: raw expose vs sandbox expose** — evaluar si necesitamos ambas primitivas (`exposeSandboxPort` L7 HTTP + `exposeSandboxRawPort` L4 DNAT). El L4 fue necesario para UDP de LiveKit; revisar si hay casos donde L7 podría bastar o si el L4 debería absorber al L7. Documentar diferencias claras en CLAUDE.md antes de agregar más templates que usen raw. Ver `sandbox-host/internal/api/handlers.go` handlers `exposePort` + `exposeRaw`, y `studioOperations.ts` `createRoom`.

- **PENDIENTE DISCUSIÓN: Rendimiento de generación de documentos** — Gemini 2.5 Pro promedia 87s por generación (p95: 111s), ~23K tokens input/output. Bajar a Flash no es opción (afecta calidad). Explorar: reducir tokens en prompts, caching de system prompt, batching más eficiente en generación paralela. Script diagnóstico: `scripts/ai-gen-log-diagnostics.ts`
- **Won't fix**: credentials encryption at rest, storage quota enforcement, persistent rate limiter, API v1 restructure
- **Planned**: RAG as a Service — allow agents to index and query files via retrieval-augmented generation
- **DONE**: Video Calls 1:1 + Recording — **LiveKit** vía template **ghosty-studio** (estudio de grabación, `sandbox-host/templates/livekit-svc/room.html`). Llamadas + grabación que se sube como archivo a EasyBits. (NO usamos AWS Chime.)
- **Planned**: Llamadas con Nova Sonic (voz) — reusar el feature de llamadas LiveKit / ghosty-studio (ya existente) para conectar Amazon Nova Sonic como interlocutor de voz. Ghosty debe poder **crear una llamada para hablar con él** (Ghosty agenda/inicia la call), compartiendo el **mismo contexto del grupo de WhatsApp** (memoria/historial del agente). Así el usuario habla por voz con Ghosty/Nova Sonic en lugar de solo texto.
- **Planned**: YouTube-style "Video Elements" section — reusable dark card/section with action rows, inspired by YouTube Studio
- **URGENTE — Streaming para presentaciones**: Igual que landings v2, convertir generación de slides a streaming SSE para que el usuario vea slides aparecer una a una en vez de esperar todas
- **Imagen de referencia para bloques**: El usuario sube/pega una imagen y la AI genera el bloque replicando ese diseño (Claude vision). Aplica a landings y presentaciones

## Siguiente Foco (Mar 2026) — Clase S antes de features nuevos
**Estrategia**: Hacer que cada feature existente funcione clase S antes de añadir cosas nuevas. Búsqueda semántica y RAG se posponen — son features de escala, no de early adopters.

**ESTADO (Jun 2026)**: Clase S prácticamente completado. Lo que queda abierto son los bugs puntuales de Documents (ver "## TODOs" arriba) y el AI Theme Creator (P6). El foco siguiente son features nuevos: Llamadas con Nova Sonic, HLS streaming, RAG.

**DONE (Mar 7-10)**:
- Cert management system (audit, cleanup, admin UI, cron endpoint)
- Landings v2 streaming generation (SSE, block-by-block con animación + auto-scroll)
- Pexels stock photos automáticas en hero/imageText blocks
- Variantes visuales para 6 tipos de bloque (features, stats, testimonials, FAQ, pricing, team)
- Cron purge-certs en GitHub Actions (junto a purge-files)
- Gallery masonry variant + Timeline steps variant
- Prompt de generación mejorado (diversidad de bloques, variantes, imageSearchQuery obligatorio)
- logoCloud variantes visuales (grid=corporate cards, row=grayscale strip con hover)
- **Landings v3**: canvas editor, Sonnet generation, Haiku refine, floating toolbar, code editor with flash highlight, semantic color themes, multi-color custom picker, viewport buttons, sidebar delete/rename, variante contextual (element vs section), deploy fix, toolbar viewport clamping
- **FloatingToolbar mejorado**: tag switcher, size presets (padding/margin/width/text/font-weight/rounded para containers/text/buttons/imgs), dual color rows, delete element. Class replace ahora parent-side (no iframe). Shimmer placeholders para imágenes cargando. Cmd+Z desde iframe forwarded al parent.
- **Documents editor**: prompt bar removida, undo/redo funciona desde canvas

**Prioridad 1-3 — Clase S (DONE Jun 2026)**: Landings v3/Documents, previews de archivos inline, presentaciones. Queda solo el backlog de bugs de Documents (ver "## TODOs") y refinamientos menores (FloatingToolbar upload vs AI image, customColors al AI en landings v4).

**Prioridad 4 — HLS Streaming (diseñar UI + MCP)**:
- Auto-transcode: al subir video, FFmpeg genera `.m3u8` + segments en background
- MCP: `get_file` devuelve `hlsUrl` para videos transcodificados
- MCP: nuevo tool `transcode_video` para triggear manualmente (calidad, resolución)
- UI: player HLS inline en dashboard de archivos (video.js o hls.js)
- UI: status de transcoding (pending → processing → ready)
- Approach comunidad: FFmpeg-MCP wrapper + auto-detect video MIME type
- Infra: FFmpeg worker en Fly Machine (se levanta bajo demanda, no siempre corriendo)

**Prioridad 5 — Experiencia de plataforma**:
- Logs de actividad — qué hizo mi agente, cuándo, qué archivos tocó
- Dashboard con métricas reales — storage usado, requests/día, archivos por tipo

**Prioridad 5 — DX/Onboarding para agentes**:
- Quickstart claro: conectar agente y usar EasyBits en 2 minutos
- Errores útiles en SDK/API — mensajes que digan qué hacer, no solo qué falló

**Prioridad 6 — AI Theme Creator**:
- Creador de temas con IA: el usuario describe el mood/estilo → AI genera paleta completa (12 colores semánticos). Aplica a landings v4, documentos, y presentaciones.

## Brand: logo animado (wordmark "EasyBits" — efecto FlipLetters)

El logo de la marca = **icono de ojitos + wordmark "EasyBits" animado**. Aparece en el sidebar (`app/components/DashLayout/SideBar.tsx`) y en el nav de login (`app/components/login/auth-nav.tsx`). Cualquier agente que necesite "el logo animado de easybits" debe reusar ESTO (no reinventarlo, no usar un gif):

- **Icono (ojitos):** `/logo-purple.svg` (público) — también `/icons/eyes-logo-purple.svg`. Estático.
- **Animación del wordmark:** componente `app/components/animated/FlipLetters.tsx` (usa `motion/react`: `useAnimate` + `stagger`). Es un **efecto dominó 3D**: dos capas de las mismas letras superpuestas (`perspective: 1000px; transform-style: preserve-3d`); **al hover**, la capa de enfrente voltea hacia arriba (`rotateX: 90deg, y: -40%`) y la de atrás entra (`rotateX: 0`), **staggered 0.05s por letra, duración 0.3s** (`{ duration: 0.3, delay: stagger(0.05) }`). En reposo: front en `rotateX:0`, back en `rotateX:90` (de canto). Variante `type="light"` = texto negro (para fondos claros).
- **Fuente:** `"Jersey 10"` (Google Font). Import en `app/app.css`: `@import url("https://fonts.googleapis.com/css2?family=Jersey+10&display=swap")`; clase `.font-jersey { font-family: "Jersey 10", serif; }`.

**Transportarlo a HTML plano / contextos sin React (ej. páginas servidas por un box):** usar **Motion One** (`motion` vanilla, misma familia) por CDN — `import { animate, stagger } from "https://cdn.jsdelivr.net/npm/motion@11/+esm"` — y replicar el flip con dos `<div>` de `<span>` por letra + los mismos keyframes (`rotateX`, `y`, `stagger(0.05)`, `duration 0.3`). **Implementación de referencia ya hecha** en `sandbox-host/templates/livekit-svc/room.html` (el estudio de grabación): copiar de ahí el bloque CSS (`#ebWord`/`.ebRow`/`.font-jersey`), el markup (ojitos + dos `.ebRow`) y el `<script type="module">` con Motion One.
