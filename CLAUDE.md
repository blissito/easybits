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

## Deploy
- Auto-deploys on push to `main` via GitHub Actions → Fly.io
- Dockerfile uses layer caching (deps cached separately from source)
- Runtime packages MUST be in `dependencies` (not `devDependencies`) — `npm prune --omit=dev` runs in Docker

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
- **Resolved**: IDOR downloads, endpoint auth, session cookie, Stripe signature verification, asset dedup, DB indexes
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
- Canvas: `app/components/landings3/Canvas.tsx` — iframe with injected HTML, click-to-select elements
- SectionList: `app/components/landings3/SectionList.tsx` — sidebar with theme picker, reorder, delete, double-click rename
- FloatingToolbar: `app/components/landings3/FloatingToolbar.tsx` — AI prompt, variante button, style presets, attr editing
- CodeEditor: `app/components/landings3/CodeEditor.tsx` — CodeMirror 6, flash highlight, format, Cmd+S save
- Generation: `app/routes/api/v2/landing3-generate.ts` — **Sonnet 4.6**, streaming SSE, NDJSON brace-depth parser
- Refine: `app/routes/api/v2/landing3-refine.ts` — **Haiku 4.5** (Sonnet for vision), streaming SSE, element-level or section-level
- Types: `app/lib/landing3/types.ts` — Section3, IframeMessage, CustomColors
- Themes: `app/lib/landing3/themes.ts` — semantic color system (primary/secondary/accent/surface), multi-color custom picker
- Build: `app/lib/landing3/buildHtml.ts` — assembles full HTML with Tailwind CDN + theme CSS
- Images: auto-enriched via `data-image-query` attr → Pexels (`app/.server/images/enrichImages.ts`)
- Deploy: static HTML to `slug.easybits.cloud` via `deployLanding` in `app/.server/core/landingOperations.ts`
- Key differences from v2: free-form HTML sections (not block schema), iframe canvas (not React components), semantic color tokens, CodeMirror code editor

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

## TODOs & Technical Debt
- Audit tracker: `memory/audit-todos.md` — all critical/high items resolved, remaining items marked won't fix
- **Won't fix**: credentials encryption at rest, storage quota enforcement, persistent rate limiter, API v1 restructure
- **Planned**: RAG as a Service — allow agents to index and query files via retrieval-augmented generation
- **Planned**: Video Calls 1:1 + Recording — AWS Chime SDK, llamadas 1:1 entre usuarios, grabación automática que se sube como archivo a EasyBits. Costo estimado ~$0.41 USD/hr (audio+video) + recording pipeline. Ya existe POC en el proyecto.
- **Planned**: YouTube-style "Video Elements" section — reusable dark card/section with action rows, inspired by YouTube Studio
- **URGENTE — Streaming para presentaciones**: Igual que landings v2, convertir generación de slides a streaming SSE para que el usuario vea slides aparecer una a una en vez de esperar todas
- **Imagen de referencia para bloques**: El usuario sube/pega una imagen y la AI genera el bloque replicando ese diseño (Claude vision). Aplica a landings y presentaciones

## Siguiente Foco (Mar 2026) — Clase S antes de features nuevos
**Estrategia**: Hacer que cada feature existente funcione clase S antes de añadir cosas nuevas. Búsqueda semántica y RAG se posponen — son features de escala, no de early adopters.

**DONE (Mar 7-8)**:
- Cert management system (audit, cleanup, admin UI, cron endpoint)
- Landings v2 streaming generation (SSE, block-by-block con animación + auto-scroll)
- Pexels stock photos automáticas en hero/imageText blocks
- Variantes visuales para 6 tipos de bloque (features, stats, testimonials, FAQ, pricing, team)
- Cron purge-certs en GitHub Actions (junto a purge-files)
- Gallery masonry variant + Timeline steps variant
- Prompt de generación mejorado (diversidad de bloques, variantes, imageSearchQuery obligatorio)
- logoCloud variantes visuales (grid=corporate cards, row=grayscale strip con hover)
- **Landings v3**: canvas editor, Sonnet generation, Haiku refine, floating toolbar, code editor with flash highlight, semantic color themes, multi-color custom picker, viewport buttons, sidebar delete/rename, variante contextual (element vs section), deploy fix, toolbar viewport clamping

**Prioridad 1 — Landings v3 clase S (SIGUIENTE)**:
- Streaming para presentaciones (mismo patrón SSE que landings v2)
- Imagen de referencia: usuario sube imagen → AI replica el diseño como sección
- FloatingToolbar IMG: diferenciar "subir imagen" (upload/URL) vs "generar imagen con AI" (DALL-E) — actualmente solo hay campo SRC manual y el botón de cámara no distingue entre ambos flujos

**Prioridad 2 — Previews de archivos inline (table stakes)**:
- Imágenes, PDFs, video, audio — preview inline en el dashboard de archivos
- Sin esto la plataforma se siente como un S3 con UI

**Prioridad 3 — Presentaciones clase S (moat del producto)**:
- TipTap editor inline (P0) — reemplazar textarea
- Slide layouts pro (P1) — 8 layouts que eleven la calidad visual

**Prioridad 4 — Experiencia de plataforma**:
- Logs de actividad — qué hizo mi agente, cuándo, qué archivos tocó
- Dashboard con métricas reales — storage usado, requests/día, archivos por tipo

**Prioridad 5 — DX/Onboarding para agentes**:
- Quickstart claro: conectar agente y usar EasyBits en 2 minutos
- Errores útiles en SDK/API — mensajes que digan qué hacer, no solo qué falló
