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
