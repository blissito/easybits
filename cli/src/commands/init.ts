import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { Command } from "../types.js";
import { str } from "../args.js";
import { emit } from "../output.js";
import { usageError } from "../errors.js";

// ─── init: dejar el repo listo para desplegar en cada push ───────
//
// Escribe el workflow de GitHub Actions y el script que despliega.
//
// El build ocurre en el runner y a la máquina le llega el resultado ya hecho:
// así la caja no compila nada y un sitio que necesitaría 4 GB para bundlear
// cabe en la más pequeña. El runner es Linux x64, igual que la microVM, así
// que los módulos nativos compilan para el destino correcto — hacer esto en
// una Mac sí rompe.
export const init: Command = {
  name: "init",
  group: "Hosting",
  summary: "Write the GitHub Actions deploy workflow for this repo",
  synopsis: "init",
  leaf: {
    summary: "Write the GitHub Actions workflow that deploys this repo on every push to main",
    usage: "easybits init [--app-dir /srv/app] [--port 3000]",
    options: {
      "app-dir": { type: "string", value: "dir", description: "Where the app lives in the machine (default /srv/app)" },
      port: { type: "string", value: "port", description: "Port your app listens on (default 3000)" },
    },
    examples: ["easybits init", "easybits init --app-dir /srv/app --port 8080"],
    async run(ctx) {
  const appDir = str(ctx, "app-dir") ?? "/srv/app";
  const port = str(ctx, "port") ?? "3000";

  if (!existsSync("package.json")) {
    throw usageError("No package.json here. Run this at the root of your app's repo.", this.usage);
  }

  const workflow = `# Despliegue a EasyBits en cada push a main.
#
# El build ocurre AQUÍ, no dentro de la máquina: así la caja sólo descarga y
# arranca, y el sitio cabe en un tier pequeño. Si el build falla, no llega a
# producción y el sitio sigue en pie.
#
# Secretos que necesita el repo (Settings → Secrets and variables → Actions):
#   EASYBITS_API_KEY     tu key de easybits.cloud/dash/developer
#   EASYBITS_SANDBOX_ID  el id que devolvió machines/launch al crear la máquina
#
# Las variables de la app (DATABASE_URL, etc.) NO van aquí: se cargan una vez
# con PUT /machines/:id/secrets y viven cifradas en tu bóveda.
name: Deploy a EasyBits

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency: deploy-produccion

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build

      - name: Empaquetar y desplegar
        env:
          EASYBITS_API_KEY: \${{ secrets.EASYBITS_API_KEY }}
          EASYBITS_SANDBOX_ID: \${{ secrets.EASYBITS_SANDBOX_ID }}
          EASYBITS_APP_DIR: ${appDir}
          EASYBITS_PORT: "${port}"
        run: node .github/scripts/easybits-deploy.mjs
`;

  const script = [
    '// Empaqueta lo que hace falta para servir y lo manda a la máquina.',
    "// Lo genera 'easybits init'; ajústalo si tu app necesita otros archivos.",
    '',
    'import { createReadStream, statSync } from "node:fs";',
    'import { execFileSync } from "node:child_process";',
    '',
    'const API = process.env.EASYBITS_API || "https://www.easybits.cloud/api/v2";',
    'const KEY = process.env.EASYBITS_API_KEY;',
    'const MACHINE = process.env.EASYBITS_SANDBOX_ID;',
    'const APP_DIR = process.env.EASYBITS_APP_DIR || "' + appDir + '";',
    'const PORT = Number(process.env.EASYBITS_PORT || ' + port + ');',
    'const TARBALL = "/tmp/easybits-build.tgz";',
    'const SHA = (process.env.GITHUB_SHA || "manual").slice(0, 7);',
    '',
    'if (!KEY || !MACHINE) {',
    '  console.error("Faltan EASYBITS_API_KEY o EASYBITS_SANDBOX_ID en los secretos del repo.");',
    '  process.exit(1);',
    '}',
    '',
    'async function api(path, body) {',
    '  const res = await fetch(API + path, {',
    '    method: "POST",',
    '    headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" },',
    '    body: JSON.stringify(body),',
    '  });',
    '  const text = await res.text();',
    '  let data;',
    '  try { data = JSON.parse(text); } catch { data = {}; }',
    '  if (!res.ok) {',
    '    console.error("x " + path + " respondio " + res.status);',
    '    console.error(data.message || data.error || text);',
    '    process.exit(1);',
    '  }',
    '  return data;',
    '}',
    '',
    '// Servir no necesita vite ni los compiladores: podarlos es la diferencia',
    '// entre mandar 170 MB por deploy y mandar lo que la maquina ejecuta.',
    'console.log("-> podando dependencias de desarrollo");',
    'execFileSync("npm", ["prune", "--omit=dev"], { stdio: "inherit" });',
    '',
    'console.log("-> empaquetando");',
    'execFileSync("tar", [',
    '  "czf", TARBALL, "--exclude=.git", "--exclude=node_modules/.cache",',
    '  "build", "node_modules", "package.json", "package-lock.json",',
    ']);',
    'const size = statSync(TARBALL).size;',
    'console.log("   " + (size / 1048576).toFixed(1) + " MB");',
    '',
    '// Publico y de vida corta: la caja lo baja con curl, sin credenciales. No',
    '// lleva secretos: esos los inyecta EasyBits desde la boveda, ya dentro.',
    'console.log("-> subiendo");',
    'const up = await api("/files", {',
    '  fileName: "build-" + SHA + ".tgz",',
    '  contentType: "application/gzip",',
    '  size,',
    '  access: "public",',
    '});',
    'const put = await fetch(up.putUrl, {',
    '  method: "PUT",',
    '  headers: { "Content-Type": "application/gzip", "Content-Length": String(size) },',
    '  body: createReadStream(TARBALL),',
    '  duplex: "half",',
    '});',
    'if (!put.ok) {',
    '  console.error("x la subida devolvio " + put.status);',
    '  process.exit(1);',
    '}',
    '',
    '// prebuilt: la caja no reconstruye nada, solo descomprime y arranca.',
    'console.log("-> desplegando");',
    'const out = await api("/machines/launch", {',
    '  sandboxId: MACHINE,',
    '  archiveUrl: up.file.url,',
    '  prebuilt: true,',
    '  appDir: APP_DIR,',
    '  port: PORT,',
    '  message: "deploy " + SHA,',
    '});',
    '',
    'if (out.exitCode !== 0) {',
    '  console.error("x termino con codigo " + out.exitCode);',
    '  console.error(out.buildOutput || out.startOutput || "");',
    '  process.exit(1);',
    '}',
    'console.log("OK desplegado - version " + out.version);',
    'console.log("   " + out.url);',
    '',
  ].join("\n");


  mkdirSync(".github/workflows", { recursive: true });
  mkdirSync(".github/scripts", { recursive: true });
  writeFileSync(".github/workflows/easybits-deploy.yml", workflow);
  writeFileSync(".github/scripts/easybits-deploy.mjs", script);

  const written = [".github/workflows/easybits-deploy.yml", ".github/scripts/easybits-deploy.mjs"];
  emit(ctx, { written, appDir, port: Number(port) }, () => console.log(`Done. Wrote:
  .github/workflows/easybits-deploy.yml
  .github/scripts/easybits-deploy.mjs

One-time setup left:

1. Create the machine (if you don't have one yet):

   curl -X POST https://www.easybits.cloud/api/v2/machines/launch \\
     -H "Authorization: Bearer $EASYBITS_API_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{"repo":"https://github.com/YOU/REPO.git","branch":"main",
          "tier":"micro","template":"node","appDir":"${appDir}","port":${port}}'

   Private repo: keep the URL clean and pass the token separately,
     "repoToken":"github_pat_…"
   (a token inside the URL is rejected).

   Does your build fit in the machine? Then you don't need this workflow:
   POST /machines/SANDBOX_ID/push-deploy gives you a GitHub webhook
   and every push deploys by itself. Docs: https://www.easybits.cloud/docs

2. Add these repo secrets (Settings → Secrets and variables → Actions):
     EASYBITS_API_KEY      your key
     EASYBITS_SANDBOX_ID   the id returned by step 1

3. If your app uses secret env vars:

   easybits machines secrets set SANDBOX_ID DATABASE_URL=...

From then on, every push to main deploys.`));
    },
  },
};
