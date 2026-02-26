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

## TODOs & Technical Debt
- Audit tracker: `memory/audit-todos.md` — all critical/high items resolved, remaining items marked won't fix
- **Won't fix**: credentials encryption at rest, storage quota enforcement, persistent rate limiter, API v1 restructure
- **Planned**: RAG as a Service — allow agents to index and query files via retrieval-augmented generation
