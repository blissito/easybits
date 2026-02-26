# Audit TODOs — Estado Final (Feb 2026)

## Resueltos ✅

| # | Item | Estado |
|---|------|--------|
| 1 | IDOR downloads | ✅ Resuelto |
| 2 | Endpoint auth | ✅ Resuelto |
| 3 | Session cookie secure | ✅ Resuelto |
| 4 | Stripe signature verification | ✅ Resuelto |
| 5 | Asset dedup | ✅ Resuelto |
| 6 | DB indexes | ✅ Resuelto |
| 9-16 | Auth, CSRF, rate limiting, CAPTCHA, etc. | ✅ Resuelto |
| 17 | Archivos sin paginación | ✅ Resuelto — cursor-based 25/page |
| 18 | Sin confirmación destructivas | ✅ Resuelto (commit 8e8b76c) |
| 19 | Sin loading states | ✅ Resuelto (commit 8e8b76c) |
| 20 | Empty states | ✅ Resuelto — sales/clients/purchases tienen componentes |
| 21 | A11y (aria, focus) | ✅ Resuelto (commit 8e8b76c) |
| 22 | Meta tags faltantes | ✅ Resuelto — terminos.tsx y aviso.tsx ahora tienen meta |
| 23 | Sitemap solo blog | ✅ Resuelto — incluye estáticas (planes, devs, funcionalidades, docs, terminos, aviso) |
| 24 | lang="en" → "es" | ✅ Resuelto |
| 26 | Código muerto | ✅ Resuelto |
| 27 | Tests faltantes | ✅ Resuelto — purge-cron.test.ts agregado |
| 28 | @ts-ignore | ✅ Resuelto |
| 33 | Redirect cookie sin firmar | ✅ Resuelto — usa `secrets: [getJwtSecret()]` |
| 34 | CORS `*` | ✅ Resuelto — configurado con dominios propios |
| 35 | Health check sin DB | ✅ Resuelto — hace `db.user.findFirst()` |

## Won't Fix (no crítico, aceptado)

| # | Item | Razón |
|---|------|-------|
| 7 | Credentials encryption at rest (StorageProvider) | Riesgo aceptado |
| 8 | Credentials encryption at rest (AiKey) | Riesgo aceptado |
| 25 | API v1 monolítica | No aplica — 27 archivos separados, 2854 LOC, bien organizada |
| 29 | Storage quota enforcement por tier | No crítico — feature de monetización futura |
| 30 | Share token history view | Feature futura — no es deuda técnica |
| 31 | Extended trash retention | Feature futura — upsell |
| 32 | Rate limiter persistente (Redis/Upstash) | In-memory LRU suficiente para escala actual |
