# Hosting desde Git — spec: «Conecta tu repo y ya está» — EasyBits Hosting vs Vercel, Netlify, Heroku, Fly, Render, Railway, Cloudflare, Coolify

## Contexto
Premisa: traer clientes que hoy pagan $20 USD en Vercel «porque conectan el repo y ya está». Ya está en prod
(24-sep): GitHub App `ghosty-studio` compartida con Teams, importar repo en `/dash/hosting`, push→redeploy por
webhook único, detección mínima (estático → `serve`). Falta cerrar la paridad con lo que TODOS los players hacen
y fijar lo que nos diferencia.

> **Webhook (24-sep):** la URL única de la App ahora es de Ghosty Studio (`https://www.ghosty.studio/api/github/app-hook`):
> verifica, guarda y nos reenvía verbatim `push`/`installation`/`ping`/`pull_request` con reintentos, firmado con
> `GITHUB_APP_WEBHOOK_FORWARD_SECRET`. `verifyAppWebhook` acepta ese y el de la App (rollback = volver la URL aquí). Fuentes: tres investigaciones sobre docs oficiales (24-sep-2026); cada afirmación
de abajo tiene URL en el anexo que se guarda con el spec.

## 1. Lo que hacen todos (la barra mínima)
| Paso | Vercel | Netlify | Render | Railway | Cloudflare | Heroku | Fly | Coolify |
|---|---|---|---|---|---|---|---|---|
| Login/Git | GitHub App | GitHub App (repos elegidos) | GitHub App | GitHub | GitHub App | OAuth | ❌ (Actions+token) | App por instancia (manifest) |
| Pantalla antes de Deploy | nombre, preset, root dir, build/output/install, env | nombre, rama, base, build, publish, env | nombre, región, rama, runtime, build, start, plan | «Deploy Now» o «Add Variables» | preset, build, output | CLI | `fly launch` resume y confirma | build pack, rama, dominio |
| Detección | 60+ presets; lockfile → pm; Node por `engines` | presets; lockfile; `.nvmrc` | runtimes nativos | Railpack (estático = Caddy) | 28 presets; estático = `exit 0` | buildpacks | scanners → Dockerfile | Nixpacks/Railpack/Static/Docker |
| Push → deploy | ✅ | ✅ | ✅ (o «tras CI») | ✅ (Wait for CI) | ✅ | ✅ (Wait for CI) | Action | ✅ + watch paths |
| Preview por PR | cada push + comentario + status + Deployments API | Deploy Preview + comentario + checks | PR previews | PR envs + comentario | alias por rama + check runs | Review Apps | Action | `{{pr_id}}.preview` + 1 comentario editable |
| Saltar deploy | Ignored Build Step | `[skip ci]`/`[skip netlify]` | `[skip render]` | — | — | — | — | `[skip ci]`/`[skip cd]` |
| Rollback | instantáneo | «Publish deploy» | reusa build | sí | 100 versiones | `heroku rollback` | — | imagen previa |
| Logs de build | en vivo, permalink por línea | deploy log | página Deploys | por deploy | en vivo | terminal | terminal | enlace en PR |
| Aviso de fallo | web+email | email (Pro)/Slack | email/Slack | webhook (sin firma) | email/webhook | email (release) | — | 6 canales |
| Dominio default | `proyecto.vercel.app` | `nombre.netlify.app` | `*.onrender.com` | «Generate Domain» | `*.pages.dev` | `app-hash.herokuapp.com` | `app.fly.dev` | wildcard/sslip |

**Quejas del mercado que atacamos:** facturas sorpresa (Vercel $96k, Netlify $104k), Netlify pausa TODOS los
sitios al agotar créditos, Render duerme (≈1 min en despertar) y cobra $0.15/GB, Vercel Hobby prohíbe uso
comercial, dependencia de un solo proveedor con Next.js.

## 2. Lo que nos diferencia (se dice en la landing, se cumple en el producto)
- Precio fijo en MXN, sin cobro por tráfico, sin tope que tumbe el sitio: máquina suelta desde $49/$99.
- Uso comercial permitido desde el primer peso; nunca se duerme (VM siempre encendida).
- Estático con dominio propio ya incluido (Website: `slug.easybits.cloud` + custom domain + TLS).
- Acceso: plan vigente o trial = sin pasarela (ya en `stripe_machines.ts`); admins/invitados = `courtesyHosting`
  (ya en `buyMachine`); sin plan = checkout de máquina suelta (ya en `startMachineCheckout`). **No se toca.**

## 3. Decisiones firmes
1. **Dos destinos según lo detectado.** Estático (sin `start`) → **Website** (ya existe, con dominio). Con servidor →
   **máquina** (`launchApp`). Hoy un estático se va a máquina con `serve`: se corrige.
2. **Una sola GitHub App** (`ghosty-studio`). Permisos nuevos sólo en bloque y avisando (re-aceptan las
   instalaciones de Teams). El PR preview usa `pull_requests: write` (ya lo tiene) → sin re-aceptar.
3. **Un registro `Deployment` por intento** (hoy no existe): es lo que habilita logs en vivo, historial, avisos y
   estado en GitHub. Es la pieza que falta en todos los P0.
4. **Config en el repo opcional**: `easybits.json` (ya se hornea en cada release) gana sobre la detección, como
   `vercel.json`/`netlify.toml`.
5. **Sin Docker ni GitLab/Bitbucket en esta fase.**

## 4. Alcance por prioridad (✅ ya · 🟡 parcial · ❌ falta)
### P0 — paridad con «conecto y ya está»
| # | Pieza | Estado | Qué se hace |
|---|---|---|---|
| 1 | Conectar GitHub + elegir repos | ✅ | — |
| 2 | Pantalla **Configurar** antes de Deploy | ❌ | repo → detección visible y editable: preset, root dir, install, build, output/start, rama, variables (pegar `.env`) → Desplegar |
| 3 | Detección | 🟡 | lockfile → npm/pnpm/yarn/bun; Node de `engines`/`.nvmrc`; presets por dependencia: next, astro, vite, nuxt, sveltekit, react-router/remix, express/fastify/hono (start), estático; salida por preset (`dist`, `build`, `out`, `.next`…) |
| 4 | Estático → Website | ❌ | build en caja efímera → sube la salida al Website del usuario (crea uno por repo) → `slug.easybits.cloud` |
| 5 | Deploy asíncrono + **logs en vivo** | ❌ | `Deployment {source, sha, status queued/building/ready/failed/canceled, log, url, target}`; la acción regresa al instante; la página del deploy hace streaming |
| 6 | Push → producción | ✅ máquina / ❌ Website | mismo webhook único, ramifica por destino |
| 7 | `[skip ci]` / `[skip easybits]` | ❌ | en `acceptPush` |
| 8 | Aviso de fallo | 🟡 | email ya existe en push; sumar el primer deploy y el estado en la UI |
| 9 | Historial + rollback | 🟡 | máquina: releases ✅; Website: versión anterior de la salida |
| 10 | URL default legible | ❌ | máquina: `<proyecto>.sandboxes.easybits.cloud` en vez de `sb-<hash>-3000…` |
### P1 — lo que hace que se queden
Preview por PR (evento `pull_request`, caja/Website efímero, UN comentario que se edita como Coolify, se borra
al cerrar; forks apagados) · «Esperar a que pase CI» (checks en `success`) · root dir de monorepo · estado en el
commit (requiere `statuses: write` → aviso a Teams) · notificación por WhatsApp/Slack.
### P2
Importador «Vengo de Vercel/Netlify» (lee `vercel.json`/`netlify.toml`: build, output, redirects, headers; pega
env) · Dockerfile · GitLab/Bitbucket · watch paths.

## 5. Archivos (EasyBits)
- `prisma/schema.prisma`: modelo `Deployment` (+ índice por `ownerId`, `target`).
- `app/.server/core/githubImportOperations.ts`: `detectRunspec` → `detectProject` (presets, pm, node, destino);
  `importRepo` crea `Deployment` y encola; `handleAppWebhook` ramifica máquina/Website, `[skip …]`.
- `app/.server/core/releaseOperations.ts` (`launchApp`): recibe un `onLog` para volcar al `Deployment`.
- `app/.server/core/siteOperations.ts` + el upload de `operations.ts`: publicar una carpeta de salida en un Website.
- `app/.server/core/pushDeployOperations.ts`: reusar cola/colapso para ambos destinos.
- UI: `app/routes/dash/hosting.tsx` (Configurar + lista de deploys) y ruta nueva de detalle con stream de logs.
- Reusar: `installationToken`, `readRepoFile`, `verifyAppWebhook` (`githubApp.ts`), `buyMachine`, `applyRelease`,
  `notifyFailure`.

## 6. Orden de implementación
P0 en este orden: 5 (Deployment + logs) → 2/3 (Configurar + detección) → 4 (estático → Website) → 6-10.

## 7. Verificación (P0)
- Repo estático (`blissito/hectorbliss.com`) → cae en Website, `slug.easybits.cloud` sirve, sin máquina.
- Repo Vite/Astro → Website con `dist`. Repo Express/Next con `start` → máquina.
- Logs se ven en vivo; un build roto deja el sitio anterior y manda email.
- Push con `[skip ci]` no despliega; push normal redeploya ambos destinos.
- Usuario trial y admin sin checkout; usuario sin plan → checkout de máquina.
- `npx vitest run`, `npm run build`, docsDrift (OpenAPI) en verde.

## Anexo — fuentes (docs oficiales, consultadas 2026-09-24)

**Vercel**
- GitHub App y permisos, comentarios/status/Deployments API: https://vercel.com/docs/git/vercel-for-github
- Import y pantalla Configurar, rama de producción, Hobby sin repos privados de org: https://vercel.com/docs/git
- Presets, estático «Other» (`public` o `.`): https://vercel.com/docs/builds/configure-a-build
- Package manager por lockfile: https://vercel.com/docs/package-managers
- Node 24/22/20, `engines`: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Monorepos: https://vercel.com/docs/monorepos
- Ignored Build Step: https://vercel.com/docs/project-configuration/project-settings
- Deploy hooks: https://vercel.com/docs/deploy-hooks
- Instant Rollback: https://vercel.com/docs/instant-rollback
- Env vars: https://vercel.com/docs/environment-variables
- URLs generadas: https://vercel.com/docs/deployments/generated-urls
- Dominio propio: https://vercel.com/docs/domains/set-up-custom-domain
- Logs y límites: https://vercel.com/docs/deployments/logs · https://vercel.com/docs/limits
- Notificaciones: https://vercel.com/docs/notifications
- Hobby no comercial: https://vercel.com/docs/limits/fair-use-guidelines · precios: https://vercel.com/pricing
- Spend management por defecto (9-sep-2025): https://vercel.com/changelog/spend-management-now-enabled-by-default-on-pro · https://vercel.com/docs/spend-management

**Netlify**
- Deploy desde repo: https://docs.netlify.com/start/quickstarts/deploy-from-repository/
- GitHub App y repos elegidos: https://docs.netlify.com/build/git-workflows/repo-permissions-linking/
- Presets por framework: https://docs.netlify.com/build/frameworks/overview/
- Dependencias, lockfile, Node: https://docs.netlify.com/build/configure-builds/manage-dependencies/
- Monorepos: https://docs.netlify.com/build/configure-builds/monorepos/
- Deploy Previews / branch deploys: https://docs.netlify.com/deploy/deploy-types/deploy-previews/ · https://docs.netlify.com/deploy/deploy-types/branch-deploys/
- `[skip ci]`, rollback, lock: https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/
- Ignore builds: https://docs.netlify.com/build/configure-builds/ignore-builds/
- Build hooks: https://docs.netlify.com/build/configure-builds/build-hooks/
- Env vars: https://docs.netlify.com/build/environment-variables/overview/
- Dominios y HTTPS: https://docs.netlify.com/manage/domains/get-started-with-domains/ · https://docs.netlify.com/manage/domains/secure-domains-with-https/https-ssl/
- Notificaciones: https://docs.netlify.com/site-deploys/notifications/
- `netlify.toml`: https://docs.netlify.com/build/configure-builds/file-based-configuration/
- Migrar desde Vercel: https://docs.netlify.com/resources/checklists/vercel-to-netlify-migration/
- Créditos y pausa al agotarse: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/ · precios: https://www.netlify.com/pricing/

**Render**
- GitHub App: https://render.com/docs/github · Web services: https://render.com/docs/web-services
- Blueprint `render.yaml`: https://render.com/docs/blueprint-spec
- Deploys, «After CI Checks Pass», `[skip render]`: https://render.com/docs/deploys
- PR previews: https://render.com/docs/service-previews · rollbacks: https://render.com/docs/rollbacks
- Static sites: https://render.com/docs/static-sites · free (duerme 15 min): https://render.com/docs/free
- Ancho de banda $0.15/GB: https://render.com/docs/outbound-bandwidth
- Dominios: https://render.com/docs/custom-domains · logs: https://render.com/docs/logging · notificaciones: https://render.com/docs/notifications
- Migrar desde Heroku: https://render.com/docs/migrate-from-heroku · planes de workspace: https://render.com/changelog/updated-plans-for-render-workspaces

**Railway**
- Quick start: https://docs.railway.com/quick-start · Railpack: https://docs.railway.com/builds/railpack · estático con Caddy: https://railpack.com/languages/staticfile
- Autodeploys y Wait for CI: https://docs.railway.com/guides/github-autodeploys
- PR environments: https://docs.railway.com/reference/environments · deployments: https://docs.railway.com/reference/deployments
- Variables: https://docs.railway.com/variables · dominios: https://docs.railway.com/networking/domains/working-with-domains
- Webhooks (sin firma): https://docs.railway.com/observability/webhooks · precios: https://railway.com/pricing

**Cloudflare**
- Pages + Git: https://developers.cloudflare.com/pages/get-started/git-integration/
- GitHub App, comentarios y check runs: https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/
- Build config y presets: https://developers.cloudflare.com/pages/configuration/build-configuration/
- Previews: https://developers.cloudflare.com/pages/configuration/preview-deployments/
- Rollbacks: https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/
- Dominios: https://developers.cloudflare.com/pages/configuration/custom-domains/ · precios: https://developers.cloudflare.com/workers/platform/pricing/

**Heroku**
- Tarjeta obligatoria: https://devcenter.heroku.com/articles/account-verification
- `git push heroku main`: https://devcenter.heroku.com/articles/git · GitHub (OAuth, Wait for CI): https://devcenter.heroku.com/articles/github-integration
- Buildpacks / Cedar vs Fir: https://devcenter.heroku.com/articles/buildpacks · https://devcenter.heroku.com/articles/generations
- Review Apps: https://devcenter.heroku.com/articles/github-integration-review-apps · release phase: https://devcenter.heroku.com/articles/release-phase
- Rollback: https://devcenter.heroku.com/articles/releases · dynos: https://devcenter.heroku.com/articles/dyno-types · precios: https://www.heroku.com/pricing

**Fly.io**
- `fly launch`: https://docs.fly.io/launch/create/ · deploy: https://docs.fly.io/launch/deploy/
- CI con GitHub Actions: https://fly.io/docs/launch/continuous-deployment-with-github-actions/
- Review apps: https://docs.fly.io/blueprints/review-apps-guide/ · autostop: https://docs.fly.io/launch/autostop-autostart/
- Migrar desde Heroku: https://docs.fly.io/getting-started/migrate-from-heroku/ · precios: https://fly.io/pricing/

**Coolify (referencia self-hosted)**
- GitHub App por instancia: https://coolify.io/docs/applications/ci-cd/github/setup-app
- Manifest y webhook en código: https://github.com/coollabsio/coolify/blob/v4.x/resources/views/livewire/source/github/change.blade.php · https://github.com/coollabsio/coolify/blob/v4.x/app/Http/Controllers/Webhook/Github.php
- Comentario único de PR: https://github.com/coollabsio/coolify/blob/v4.x/app/Jobs/ApplicationPullRequestUpdateJob.php
- Previews: https://coolify.io/docs/applications/ci-cd/github/preview-deploy · build packs: https://coolify.io/docs/applications/build-packs/overview

**Quejas del mercado**
- Vercel $96k en funciones: https://news.ycombinator.com/item?id=40618220
- Netlify $104k en sitio estático: https://news.ycombinator.com/item?id=39520776
- Dependencia de Next.js con Vercel (OpenNext): https://opennext.js.org/

**No verificado en fuente oficial** (no usar en la landing sin revisar): el precio Starter de Render ($7), la pantalla final del primer deploy en Vercel y Netlify, cómo detecta Netlify un estático sin `package.json`, y el rollback de Fly.
