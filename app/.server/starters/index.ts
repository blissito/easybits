// Starters por stack: qué se escribe en /app, cómo se compila/arranca y qué le dice
// el prompt de cada turno al agente. Las reglas de cada stack salen de armarlos de
// verdad: la API de estos frameworks cambia más rápido que lo que el modelo sabe
// (SvelteKit 3 ya no lee svelte.config.js; TanStack Start sin Nitro no saca .output).
import type { SiteStackId } from "~/lib/siteStacks";
import { STARTER_FILES } from "./files";
import { shQuote } from "~/.server/core/sandboxOperations";

// Todos arrancan con el script start de su package.json y respetan PORT. Elysia va
// en la plantilla `bun` (Bun nativo, sin npm ni node en la caja); el resto en `node`.
const NODE_RUNSPEC = {
  appDir: "/app",
  buildCommand: "(npm ci || npm install) && npm run build",
  startCommand: "npm start",
  port: 3000,
};
const BUN_RUNSPEC = { ...NODE_RUNSPEC, buildCommand: "bun install && bun run build", startCommand: "bun run start" };

export function starterTemplate(stack: SiteStackId): "node" | "bun" {
  return stack === "elysia" ? "bun" : "node";
}

export function starterRunspec(stack: SiteStackId) {
  return starterTemplate(stack) === "bun" ? BUN_RUNSPEC : NODE_RUNSPEC;
}

export function starterFiles(stack: SiteStackId) {
  return STARTER_FILES[stack];
}

// Vista previa = servidor de desarrollo de cada stack en su propio puerto, aparte del
// de producción (3000, el que levanta «Publicar»). Cada archivo que escribe el agente
// aparece en segundos, sin build ni restart_machine: antes la vista previa quedaba en
// blanco hasta el build de fin de turno. Medido en node:24-slim con 900 MB/1 CPU: el
// dev responde en 1–5 s tras instalar y un cambio se ve en ~1 s (Next llega a ~840 MB).
export const PREVIEW_PORT = 5173;
export const PREVIEW_UNIT = "easybits-preview";
export const PREVIEW_SCRIPT = "/etc/easybits-preview.sh";
// Sube cuando cambia el script o la unit: las cajas con una versión vieja se reinstalan solas en el siguiente turno.
const PREVIEW_SCRIPT_VERSION = "# eb-preview v2";
export const PREVIEW_LOG_FILE = "/var/log/easybits-preview.log";
// Marca de "dependencias instaladas" FUERA de /app: no viaja en releases ni en git, y
// sobrevive al `npm ci` de «Publicar» (que borra node_modules con el dev corriendo).
export const PREVIEW_DEPS_MARK = "/var/lib/easybits-preview.deps";

const PREVIEW_COMMAND: Record<SiteStackId, string> = {
  tanstack: "vite dev --port $PORT --host",
  sveltekit: "vite dev --port $PORT --host",
  "react-router": "react-router dev --port $PORT --host",
  astro: "astro dev --port $PORT --host",
  nuxt: "nuxt dev --port $PORT --host",
  next: "next dev -p $PORT -H 0.0.0.0",
  remix: "node --watch --import remix/node-tsx server.ts",
  elysia: "bun --watch src/index.ts",
};

/**
 * Comando de shell que instala y arranca la unit de la vista previa. La unit instala
 * dependencias si faltan (recién sembrado el starter) y lee los secretos de la app
 * si ya existen. Va con OOMScoreAdjust alto: si la caja se queda sin RAM con la app
 * publicada corriendo al lado, muere primero el dev.
 */
export function previewInstallScript(stack: SiteStackId, appDir: string): string {
  const bun = starterTemplate(stack) === "bun";
  const install = bun ? "bun install" : "(npm ci || npm install)";
  // Vigilante: cuando cambian muchos archivos a la vez (conectar GitHub, un checkout)
  // Vite se reinicia solo y TanStack Start puede quedar contestando 404 vacío para
  // siempre (visto en prod 2026-10-15). Tres 404/sin respuesta seguidos → sale con
  // error y systemd lo relanza. Un 500 no cuenta: es código a medio escribir.
  const script = [
    "#!/bin/sh",
    PREVIEW_SCRIPT_VERSION,
    `cd ${appDir}`,
    `[ -f ${PREVIEW_DEPS_MARK} ] || { ${install} && touch ${PREVIEW_DEPS_MARK}; }`,
    `[ -f .easybits.env ] && { set -a; . ./.easybits.env; set +a; }`,
    `${PREVIEW_COMMAND[stack]} &`,
    "P=$!",
    `trap 'kill $P 2>/dev/null' TERM INT`,
    "command -v curl >/dev/null || { wait $P; exit $?; }",
    "sleep 60; bad=0",
    "while kill -0 $P 2>/dev/null; do",
    `  c=$(curl -s -o /dev/null -m 10 -w '%{http_code}' http://127.0.0.1:$PORT/ || true)`,
    `  case "$c" in 404|000|"") bad=$((bad+1));; *) bad=0;; esac`,
    `  [ $bad -ge 3 ] && { echo "[easybits-preview] $c tres veces: reinicio"; kill $P; exit 1; }`,
    "  sleep 10",
    "done",
    "wait $P",
  ].join("\n");
  const unit = [
    "[Unit]",
    "Description=EasyBits site preview (dev server)",
    "After=network.target",
    "StartLimitIntervalSec=0",
    "",
    "[Service]",
    `WorkingDirectory=${appDir}`,
    // Vite rechaza Hosts desconocidos: la vista previa llega como sb-<id>-5173.sandboxes.easybits.cloud.
    `Environment=PORT=${PREVIEW_PORT} NODE_ENV=development NEXT_TELEMETRY_DISABLED=1 __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=.easybits.cloud PATH=${appDir}/node_modules/.bin:/root/.bun/bin:/usr/local/bin:/usr/bin:/bin`,
    `ExecStart=/bin/sh ${PREVIEW_SCRIPT}`,
    "Restart=always",
    "RestartSec=3",
    "MemoryMax=85%",
    "OOMScoreAdjust=500",
    "TimeoutStopSec=10",
    `StandardOutput=append:${PREVIEW_LOG_FILE}`,
    `StandardError=append:${PREVIEW_LOG_FILE}`,
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "",
  ].join("\n");
  // Idempotente: si la unit ya existe no se toca (se llama antes de cada turno).
  return `grep -qsx ${shQuote(PREVIEW_SCRIPT_VERSION)} ${PREVIEW_SCRIPT} && test -f /etc/systemd/system/${PREVIEW_UNIT}.service && echo HAD || { ` + [
    `printf '%s\\n' ${shQuote(script)} > ${PREVIEW_SCRIPT}`,
    `printf '%s' ${shQuote(unit)} > /etc/systemd/system/${PREVIEW_UNIT}.service`,
    "systemctl daemon-reload",
    `systemctl enable ${PREVIEW_UNIT} >/dev/null 2>&1 || true`,
    `systemctl restart ${PREVIEW_UNIT}`,
    "echo OK",
  ].join(" && ") + "; }";
}

const RULES: Record<SiteStackId, string[]> = {
  tanstack: [
    `Stack: TanStack Start 1.169 (React 19, SSR, rutas por archivo).`,
    `Antes de tu primer cambio lee la doc de la versión instalada: sandbox_exec("cat /app/node_modules/@tanstack/react-start/skills/react-start/SKILL.md"). Start ya no usa Vinxi ni app.config.ts.`,
    `Rutas en /app/src/routes (createFileRoute; __root.tsx es el layout). Lógica de servidor (DB, secretos, APIs) con createServerFn de @tanstack/react-start. No toques server.mjs: sirve el build.`,
  ],
  next: [
    `Stack: Next.js 16 (App Router, React 19).`,
    `Antes de tu primer cambio lee sandbox_exec("cat /app/node_modules/next/AGENTS.md") y la guía que toque en /app/node_modules/next/dist/docs/ (01-app/…): esta versión rompe APIs que conoces.`,
    `Páginas en /app/app (page.tsx, layout.tsx). Server Components por default; lógica de servidor en el componente o en Server Actions ("use server"); endpoints en app/api/*/route.ts.`,
  ],
  "react-router": [
    `Stack: React Router 8 en modo framework (el sucesor de Remix 2; los paquetes @remix-run/* ya no se usan).`,
    `Antes de tu primer cambio lee sandbox_exec("cat /app/.agents/skills/react-router/SKILL.md /app/.agents/skills/react-router/references/framework-mode.md").`,
    `Rutas declaradas en /app/app/routes.ts (index/route de @react-router/dev/routes) con su módulo en app/routes/. Lógica de servidor en loader/action; tipos de cada ruta en "./+types/<ruta>" (los genera el build). Layout y documento en app/root.tsx.`,
  ],
  remix: [
    `Stack: Remix 3 — NO es React ni React Router: componentes propios de remix/component (JSX con jsxImportSource remix/component, estilos con mix={css({...})}, sin Tailwind), router por controladores y sin paso de build (Node corre el TypeScript directo).`,
    `Antes de tu primer cambio lee sandbox_exec("cat /app/AGENTS.md /app/.agents/skills/remix/SKILL.md") y busca lo que necesites en /app/node_modules/remix/INDEX.md (guías y READMEs de cada API). Nada de hooks de React.`,
    `Rutas en /app/app/routes.ts, acciones en app/actions/controller.tsx (y app/actions/<ruta>/controller.tsx), documento en app/actions/document.tsx. Lo interactivo en el navegador va en app/actions/public/ con clientEntry (ejemplo: prompt-button.tsx). Para HTML crudo usa unsafeHTML(). "npm run build" sólo corre el typecheck: si falla, corrígelo.`,
  ],
  nuxt: [
    `Stack: Nuxt 4 (Vue 3, SSR).`,
    `Doc oficial: sandbox_exec("curl -sL https://nuxt.com/llms.txt") es el índice; cada página se lee agregando .md a su URL.`,
    `El código de la app vive en /app/app (pages/, components/, composables/, app.vue); el servidor en /app/server/api (defineEventHandler) y se consume con useFetch. Config en nuxt.config.ts.`,
  ],
  sveltekit: [
    `Stack: SvelteKit 3 + Svelte 5 (runes: $props, $state, $derived; nada de "export let").`,
    `OJO, cambió: la config va en vite.config.ts como sveltekit({ adapter: adapter() }); svelte.config.js YA NO existe y el build falla si lo creas. tsconfig.json extiende "$app/tsconfig". La doc https://svelte.dev/llms-small.txt todavía enseña lo viejo en esa parte.`,
    `Rutas en /app/src/routes: +page.svelte, +page.server.ts (load y actions corren en el servidor), +server.ts para endpoints. Adaptador node: no lo cambies.`,
  ],
  elysia: [
    `Stack: Elysia 1.4 sobre Bun 1.3 (nativo). En esta máquina NO hay npm ni node: usa bun install / bun add / bun run.`,
    `Doc oficial: sandbox_exec("curl -sL https://elysiajs.com/llms.txt") es el índice.`,
    `Todo en /app/src: index.ts registra rutas (.get/.post con validación t.Object de elysia); las páginas devuelven page(título, html) de src/layout.ts y TODO dato del usuario pasa por esc(). Tailwind va por CDN (clases directas, sin build). Archivos estáticos en /app/public. "bun run build" sólo corre tsc: si falla, corrígelo.`,
  ],
  astro: [
    `Stack: Astro 7 con output "server" y el adaptador @astrojs/node (standalone).`,
    `Doc oficial: sandbox_exec("curl -sL https://docs.astro.build/en/<ruta>/") (por ejemplo guides/routing, guides/endpoints). No hay llms.txt.`,
    `Páginas en /app/src/pages (.astro; el frontmatter corre en el servidor en cada visita), layout en src/layouts/Layout.astro, endpoints en src/pages/api/*.ts (export const GET/POST). Una página estática lleva export const prerender = true. No metas React/Vue sin que lo pidan.`,
  ],
};

// Dónde vive el script del selector de elementos (EB_PICKER / eb-picker.js) en cada starter.
const PICKER_FILE: Record<SiteStackId, string> = {
  tanstack: "src/routes/__root.tsx",
  next: "app/layout.tsx",
  "react-router": "app/root.tsx",
  remix: "app/actions/document.tsx",
  nuxt: "nuxt.config.ts (app.head.script)",
  sveltekit: "src/app.html",
  astro: "src/layouts/Layout.astro",
  elysia: "src/layout.ts",
};

/** Líneas del prompt por turno para una webapp con starter. */
export function starterPrompt(stack: SiteStackId): string[] {
  return [
    `Ya hay un starter FUNCIONANDO en /app: NO cambies de stack ni reescribas la config ni los scripts de package.json (build/start ya están probados en esta caja). Mantén las versiones; no escribas APIs de memoria.`,
    ...RULES[stack],
    stack === "remix" || stack === "elysia"
      ? `Conserva el script del selector de EasyBits en ${PICKER_FILE[stack]}.`
      : `Estilos con Tailwind 4 (clases; ya configurado). Conserva el script del selector de EasyBits en ${PICKER_FILE[stack]}.`,
    `Cada sección/elemento de bloque lleva un atributo data-eb-id ÚNICO y estable (ej. data-eb-id="hero"); consérvalos al editar y cambia SOLO lo que se pide.`,
    `La vista previa es un servidor de desarrollo con recarga en caliente (servicio ${PREVIEW_UNIT}, puerto ${PREVIEW_PORT}): cada archivo que guardas aparece solo. NO corras build ni restart_machine para verla, y no levantes otro servidor.`,
    `Las dependencias se instalan solas al nacer la caja. Antes de leer node_modules o instalar paquetes espera a que acabe: sandbox_exec("timeout 300 sh -c 'until [ -f ${PREVIEW_DEPS_MARK} ]; do sleep 2; done'"). Para agregar un paquete: ${stack === "elysia" ? "bun add <paquete>" : "npm install <paquete>"} (el dev lo toma).`,
    `Antes de terminar el turno revisa errores del dev: sandbox_exec("tail -40 ${PREVIEW_LOG_FILE}") y corrígelos. «Publicar» compila y levanta la versión de producción aparte.`,
  ];
}
