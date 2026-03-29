# TypeScript Error Debt — 2026-03-28

~257 pre-existing type errors across 96 files. None block the build (app compiles and runs in production).
Critical files (documents, MCP, landings, presentations) are being fixed separately.

## Summary by Area

| Area | Files | Errors | Root Cause |
|------|-------|--------|------------|
| API v1 (legacy) | 16 | ~35 | Prisma schema changes not propagated to v1 endpoints. These routes use old model shapes (e.g. `asset` relation instead of `assetId`) |
| Assets/Store (legacy) | 11 | ~58 | Same Prisma drift + React Router v7 migration (missing `Route` namespace, `json()` → `data()`) |
| Stripe integration | 6 | ~30 | Stripe SDK type updates + null checks. `stripe.ts` has untyped params (`TS7031`), `stripe_v2.ts` needs null guards |
| Auth/Login | 2 | ~21 | `login-component.tsx` heavily untyped (17 errors alone). Likely written pre-TypeScript strict mode |
| Forms (legacy) | 6 | ~14 | `FileInput.tsx` references removed props. `AssetForm`/`FilesForm` pass wrong types to components |
| Experimental | 2 | ~11 | `DevAdmin.tsx` untyped params. `Room.tsx` uses deprecated APIs |
| Components (common) | 7 | ~15 | Minor: `Input.tsx` ref typing, `CopyButton` event types, `Banner` untyped param |
| Hooks | 6 | ~10 | `useStripeConnect` null checks, `useMarquee`/`useBrendisConfetti` missing module types |
| Server utils | 7 | ~20 | `getters.ts` (7 errors) — Prisma `include` type mismatches. `tokens.ts` interface issues. `assets.ts` unknown property |
| Routes (misc) | 12 | ~25 | `sales.tsx`, `stats.tsx`, `files.tsx`, `websites.tsx`, `webinar.tsx` — Prisma relation drift |
| Packages | 2 | ~3 | `tsup.config.ts` type mismatches in both SDK and MCP packages |
| Tests | 3 | ~5 | `stripe_v2.test.ts`, `webhookUtils.test.ts`, `storage.test.ts` — outdated mocks/imports |

## Most Common Error Types

| Code | Count | Description | Typical Fix |
|------|-------|-------------|-------------|
| TS2322 | 57 | Type not assignable | Fix type or add cast |
| TS2339 | 52 | Property does not exist | Prisma schema drift — update access pattern |
| TS2345 | 41 | Argument type mismatch | Update function signature or caller |
| TS7031 | 39 | Implicit any (parameter) | Add type annotation |
| TS7006 | 8 | Implicit any (variable) | Add type annotation |
| TS2554 | 6 | Wrong argument count | Update call site |
| TS2307 | 6 | Module not found | Install missing types or fix import |

## Recommended Fix Strategy

### Phase 1: Quick wins (~30 min, eliminates ~100 errors)
- **`getters.ts`** (7 errors): Fix Prisma `include` types — these cascade to many route files
- **`stripe.ts`** (8 errors): Add param types to handler functions
- **`login-component.tsx`** (17 errors): Add proper typing to this one file

### Phase 2: Prisma drift (~1 hr, eliminates ~80 errors)
- Many routes reference `sale.asset` instead of `sale.assetId` (Prisma removed includes)
- Fix: update queries to include relations, or change access to use IDs
- Affected: `sales.tsx`, `stats.tsx`, `SalesTable.tsx`, `storeTemplate.tsx`, `ClientsTable.tsx`

### Phase 3: Legacy cleanup (~2 hrs, eliminates ~70 errors)
- API v1 endpoints: update to match current Prisma schema
- Asset/Store routes: same Prisma fixes + React Router v7 types
- Forms: update prop types to match current component signatures

### Phase 4: Remaining (~30 min)
- Experimental components, hooks, packages, tests
- Mostly adding type annotations and fixing imports
