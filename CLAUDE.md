# EasyBits

Digital asset marketplace built with React Router v7 (ex-Remix), Prisma (MongoDB), Fly.io, and Stripe.

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

## Security & Hardening
- Auth: `getUserOrRedirect(request)` — MUST be used on every protected route/endpoint
- API auth: `requireAuth`/`requireScope` from `app/.server/apiAuth` — scope-based (READ, WRITE, DELETE, ADMIN)
- Rate limiting: `app/.server/rateLimiter.ts` — in-memory LRU, `applyRateLimit()` middleware
- CAPTCHA: Turnstile integration (`app/.server/turnstile.ts`)
- Session cookie: must have `secure: true` in production
- Credentials (StorageProvider, AiKey): stored in MongoDB — encrypt at rest
- CSRF: React Router actions have implicit protection; raw API endpoints need explicit tokens
- Webhook verification: Stripe uses signature verification; other webhooks need HMAC
- **Resolved**: IDOR downloads, endpoint auth, session cookie, Stripe signature verification, asset dedup, DB indexes
- **Remaining**: encrypt StorageProvider/AiKey credentials at rest, persistent rate limiter

## Observability & Health
- Health check: `app/routes/api/health.ts` — checks DB connectivity, returns 200/503
- Sentry: `app/.server/sentry.ts` — lazy init, 10% trace sample rate, `SENTRY_DSN` env var
- Logger: `app/.server/logger.ts` — Winston (JSON format, console + file transports)
- Telemetry: `app/.server/telemetry.ts` — visit tracking with Zod validation
- Error boundary: `app/root.tsx` — catches route errors, optional Sentry capture

## Testing
- Unit: Vitest (`test/` dir) — covers API auth, IAM, storage, Stripe, price validation, MDX, blog
- E2E: Playwright (`test/e2e-purchase.spec.ts`) — purchase flow (WIP)
- **Missing test coverage**: Stripe webhook edge cases, free_subscription, purge cron, IDOR scenarios

## TODOs & Technical Debt
- Audit tracker: `memory/audit-todos.md` — most critical/high items resolved
- **Remaining**: credentials encryption at rest (StorageProvider, AiKey), storage quota enforcement per tier, persistent rate limiter (Redis/Upstash)
- API v1 is a monolithic switch — consider separation by concern
