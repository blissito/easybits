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
- Images: `app/.server/images/pexels.ts` (Pexels stock photos)
- AI: Haiku 4.5 (outline/3D/variants) + Sonnet 4.6 (HTML slides)
- MCP: 7 tools (list/get/create/update/delete/deploy/unpublish)
- SDK: `@easybits.cloud/sdk` v0.4.0 — presentation methods
- 3D: Three.js v0.170, 5 geometries, 3 animations (float/rotate/none)
- Themes: 11 reveal.js standard themes
- Deploy: static HTML to `slug.easybits.cloud`

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
- **Planned**: YouTube-style "Video Elements" section — A dark card/section with a heading ("Elementos del vídeo"), a subtitle description, and a list of action rows. Each row has: a left icon (inside a rounded dark container), a title + subtitle stacked vertically, and a right-side action area (either a pill/chip showing a selected value + "Editar" button, or a ghost "Añadir" button if empty). Rows are separated by subtle borders, rounded corners on the card. Inspired by YouTube Studio's "Elementos del vídeo" panel (related video, subtitles, end screens, cards). Reusable pattern for any settings section with optional linked items.

## Siguiente Foco (Mar 2026) — Clase S antes de features nuevos
**Estrategia**: Hacer que cada feature existente funcione clase S antes de añadir cosas nuevas. Búsqueda semántica y RAG se posponen — son features de escala, no de early adopters.

**Prioridad 1 — Previews de archivos inline (table stakes, HACER PRIMERO)**:
- Imágenes, PDFs, video, audio — preview inline en el dashboard de archivos
- Sin esto la plataforma se siente como un S3 con UI. Nadie confía en un file storage donde no puede ver sus archivos

**Prioridad 2 — Presentaciones clase S (moat del producto)**:
- TipTap editor inline (P0) — reemplazar textarea, es lo que hace que la gente quiera usar esto vs Google Slides
- Slide layouts pro (P1) — 8 layouts que eleven la calidad visual

**Prioridad 3 — Experiencia de plataforma**:
- Logs de actividad — qué hizo mi agente, cuándo, qué archivos tocó. Crítico para auditoría/debugging de agentes
- Dashboard con métricas reales — storage usado, requests/día, archivos por tipo

**Prioridad 4 — DX/Onboarding para agentes**:
- Quickstart claro: conectar agente y usar EasyBits en 2 minutos
- Errores útiles en SDK/API — mensajes que digan qué hacer, no solo qué falló
