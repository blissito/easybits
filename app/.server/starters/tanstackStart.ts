// Starter de TanStack Start para las webapps de /dash/sitios (Site.stack = "tanstack").
// Se escribe en /app de la caja al prepararla; el agente edita a partir de aquí.
// Probado (2026-10-14): vite build → dist/{client,server}; sin Nitro la salida es un
// handler fetch, así que server.mjs (srvx) sirve dist/client y le pasa el resto.
// Versiones EXACTAS: la API de Start cambia seguido y el agente debe leer la doc que
// trae el paquete instalado (node_modules/@tanstack/react-start/skills).

export const TANSTACK_RUNSPEC = {
  appDir: "/app",
  buildCommand: "(npm ci || npm install) && npm run build",
  startCommand: "npm start",
  port: 3000,
};

export const TANSTACK_STARTER_FILES: Record<string, string> = {
  "package.json": "{\n  \"name\": \"app\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"scripts\": {\n    \"dev\": \"vite dev --port 3000 --host\",\n    \"build\": \"vite build\",\n    \"start\": \"node server.mjs\"\n  },\n  \"dependencies\": {\n    \"@tailwindcss/vite\": \"4.3.3\",\n    \"@tanstack/react-router\": \"1.170.44\",\n    \"@tanstack/react-start\": \"1.169.2\",\n    \"@types/react\": \"19.3.0\",\n    \"@types/react-dom\": \"19.3.0\",\n    \"@vitejs/plugin-react\": \"6.1.2\",\n    \"react\": \"19.3.1\",\n    \"react-dom\": \"19.3.1\",\n    \"srvx\": \"1.0.5\",\n    \"tailwindcss\": \"4.3.3\",\n    \"typescript\": \"5.9.3\",\n    \"vite\": \"8.3.4\"\n  }\n}\n",
  "vite.config.ts": "import { defineConfig } from \"vite\";\nimport { tanstackStart } from \"@tanstack/react-start/plugin/vite\";\nimport viteReact from \"@vitejs/plugin-react\";\nimport tailwindcss from \"@tailwindcss/vite\";\n\nexport default defineConfig({\n  plugins: [tailwindcss(), tanstackStart(), viteReact()],\n});\n",
  "tsconfig.json": "{\n  \"compilerOptions\": {\n    \"jsx\": \"react-jsx\",\n    \"moduleResolution\": \"Bundler\",\n    \"module\": \"ESNext\",\n    \"target\": \"ES2022\",\n    \"skipLibCheck\": true,\n    \"strictNullChecks\": true\n  }\n}\n",
  "server.mjs": "// Servidor de producción: sirve los assets de dist/client y pasa el resto a TanStack Start.\nimport { serve } from \"srvx\";\nimport { staticMiddleware } from \"srvx/static\";\nimport app from \"./dist/server/server.js\";\n\nserve({\n  port: Number(process.env.PORT) || 3000,\n  hostname: \"0.0.0.0\",\n  middleware: [staticMiddleware({ dir: \"dist/client\" })],\n  fetch: app.fetch,\n});\n",
  ".gitignore": "node_modules\n.output\ndist\n.tanstack\n.vinxi\n",
  "src/router.tsx": "import { createRouter } from \"@tanstack/react-router\";\nimport { routeTree } from \"./routeTree.gen\";\n\nexport function getRouter() {\n  return createRouter({ routeTree, scrollRestoration: true });\n}\n",
  "src/styles.css": "@import \"tailwindcss\";\n",
  "src/routes/__root.tsx": "import type { ReactNode } from \"react\";\nimport { Outlet, createRootRoute, HeadContent, Scripts } from \"@tanstack/react-router\";\nimport css from \"../styles.css?url\";\n\n// Selector de elementos del editor de EasyBits: sólo carga dentro de su vista previa\n// (?eb_edit=1 en un iframe). En producción no hace nada.\nconst EB_PICKER = `if(location.search.includes(\"eb_edit=1\")&&window.top!==window){var s=document.createElement(\"script\");s.src=\"https://www.easybits.cloud/eb-picker.js\";document.body.appendChild(s)}`;\n\nexport const Route = createRootRoute({\n  head: () => ({\n    meta: [\n      { charSet: \"utf-8\" },\n      { name: \"viewport\", content: \"width=device-width, initial-scale=1\" },\n      { title: \"Mi app\" },\n    ],\n    links: [{ rel: \"stylesheet\", href: css }],\n  }),\n  component: () => (\n    <RootDocument>\n      <Outlet />\n    </RootDocument>\n  ),\n});\n\nfunction RootDocument({ children }: Readonly<{ children: ReactNode }>) {\n  return (\n    <html lang=\"es\">\n      <head>\n        <HeadContent />\n      </head>\n      <body>\n        {children}\n        <Scripts />\n        <script dangerouslySetInnerHTML={{ __html: EB_PICKER }} />\n      </body>\n    </html>\n  );\n}\n",
  "src/routes/index.tsx": "import { createFileRoute } from \"@tanstack/react-router\";\nimport { createServerFn } from \"@tanstack/react-start\";\n\n// Corre sólo en el servidor: aquí van base de datos, secretos y llamadas a APIs.\nconst getGreeting = createServerFn({ method: \"GET\" }).handler(async () => {\n  return { message: \"Tu app ya está viva\", at: new Date().toISOString() };\n});\n\nexport const Route = createFileRoute(\"/\")({\n  loader: () => getGreeting(),\n  component: Home,\n});\n\nfunction Home() {\n  const { message, at } = Route.useLoaderData();\n  return (\n    <main data-eb-id=\"hero\" className=\"min-h-screen grid place-items-center bg-zinc-50 p-8\">\n      <div className=\"text-center\">\n        <h1 data-eb-id=\"hero-title\" className=\"text-4xl font-bold\">{message}</h1>\n        <p data-eb-id=\"hero-sub\" className=\"mt-2 text-zinc-500\">Renderizado en el servidor a las {at}</p>\n      </div>\n    </main>\n  );\n}\n",
};
