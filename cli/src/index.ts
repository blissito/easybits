#!/usr/bin/env node
import {
  EasybitsClient,
  EasybitsError,
  readRcConfig,
  writeRcConfig,
  resolveApiKey,
  resolveBaseUrl,
  createClientFromEnv,
} from "@easybits.cloud/sdk";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "fs";

// ─── Helpers ─────────────────────────────────────────────────────

/** Lee `--nombre valor` de la línea de comandos. */
function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function getClient(): Promise<EasybitsClient> {
  try {
    return await createClientFromEnv();
  } catch {
    console.error("Not logged in. Run: easybits login <api-key>");
    process.exit(1);
  }
}

// ─── Commands ────────────────────────────────────────────────────

async function login() {
  const key = process.argv[3];
  if (!key) {
    console.error("Usage: easybits login <api-key>");
    process.exit(1);
  }
  await writeRcConfig({ apiKey: key });
  console.log("Saved API key to ~/.easybitsrc");
}

async function filesList() {
  const client = await getClient();
  try {
    const data = await client.listFiles();
    if (data.items.length === 0) {
      console.log("No files found");
      return;
    }
    console.log(
      `${"Name".padEnd(30)} ${"Size".padEnd(10)} ${"Status".padEnd(10)} ID`
    );
    console.log("-".repeat(70));
    for (const f of data.items) {
      const size =
        f.size < 1024 * 1024
          ? `${(f.size / 1024).toFixed(1)}KB`
          : `${(f.size / (1024 * 1024)).toFixed(1)}MB`;
      console.log(
        `${f.name.slice(0, 29).padEnd(30)} ${size.padEnd(10)} ${f.status.padEnd(10)} ${f.id}`
      );
    }
  } catch (err) {
    if (err instanceof EasybitsError) {
      console.error(`Error ${err.status}: ${err.body}`);
      process.exit(1);
    }
    throw err;
  }
}

async function filesUpload() {
  const fileName = process.argv[4];
  if (!fileName) {
    console.error("Usage: easybits files upload <filename>");
    process.exit(1);
  }
  if (!existsSync(fileName)) {
    console.error(`File not found: ${fileName}`);
    process.exit(1);
  }
  const stat = statSync(fileName);
  const ext = fileName.split(".").pop() || "";
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    mp4: "video/mp4",
    zip: "application/zip",
  };
  const contentType = mimeMap[ext] || "application/octet-stream";

  const client = await getClient();
  try {
    const data = await client.uploadFile({
      fileName: fileName.split("/").pop()!,
      contentType,
      size: stat.size,
    });

    // Upload to presigned URL
    const fileBuffer = readFileSync(fileName);
    const uploadRes = await fetch(data.putUrl, {
      method: "PUT",
      body: fileBuffer,
      headers: { "Content-Type": contentType },
    });

    if (uploadRes.ok) {
      console.log(`Uploaded: ${data.file.id}`);
    } else {
      console.error(`Upload failed: ${uploadRes.status}`);
    }
  } catch (err) {
    if (err instanceof EasybitsError) {
      console.error(`Error ${err.status}: ${err.body}`);
      process.exit(1);
    }
    throw err;
  }
}

async function filesDelete() {
  const fileId = process.argv[4];
  if (!fileId) {
    console.error("Usage: easybits files delete <file-id>");
    process.exit(1);
  }
  const client = await getClient();
  try {
    await client.deleteFile(fileId);
    console.log("Deleted");
  } catch (err) {
    if (err instanceof EasybitsError) {
      console.error(`Error ${err.status}: ${err.body}`);
      process.exit(1);
    }
    throw err;
  }
}

async function providersList() {
  console.log("Default provider: Tigris (platform)");
  console.log("Use the Developer Dashboard to add custom providers.");
}

async function printMcpConfig() {
  const apiKey = await resolveApiKey();
  const baseUrl = await resolveBaseUrl();
  const config = {
    mcpServers: {
      easybits: {
        type: "streamable-http",
        url: `${baseUrl}/api/mcp`,
        headers: {
          Authorization: `Bearer ${apiKey || "eb_sk_live_YOUR_KEY"}`,
        },
      },
    },
  };
  console.log(JSON.stringify(config, null, 2));
}

function printMcpStdioConfig() {
  const config = {
    mcpServers: {
      easybits: {
        command: "npx",
        args: ["-y", "@easybits.cloud/mcp"],
        env: {
          EASYBITS_API_KEY: "eb_sk_live_YOUR_KEY",
        },
      },
    },
  };
  console.log(JSON.stringify(config, null, 2));
}


// ─── init: dejar el repo listo para desplegar en cada push ───────

/**
 * Escribe el workflow de GitHub Actions y el script que despliega.
 *
 * El build ocurre en el runner y a la máquina le llega el resultado ya hecho:
 * así la caja no compila nada y un sitio que necesitaría 4 GB para bundlear
 * cabe en la más pequeña. El runner es Linux x64, igual que la microVM, así
 * que los módulos nativos compilan para el destino correcto — hacer esto en
 * una Mac sí rompe.
 */
async function init() {
  const appDir = flag("--app-dir") ?? "/srv/app";
  const port = flag("--port") ?? "3000";

  if (!existsSync("package.json")) {
    console.error(
      "Aquí no hay package.json. Corre esto en la raíz del repo de tu app."
    );
    process.exit(1);
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

  console.log(`Listo. Escribí:
  .github/workflows/easybits-deploy.yml
  .github/scripts/easybits-deploy.mjs

Falta, una sola vez:

1. Crea la máquina (si aún no la tienes):

   curl -X POST https://www.easybits.cloud/api/v2/machines/launch \\
     -H "Authorization: Bearer $EASYBITS_API_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{"repo":"https://github.com/TU/REPO.git","branch":"main",
          "tier":"micro","template":"node","appDir":"${appDir}","port":${port}}'

   Un repo privado necesita un token en la URL:
   https://x-access-token:TOKEN@github.com/TU/REPO.git

2. Guarda en el repo (Settings → Secrets and variables → Actions):
     EASYBITS_API_KEY      tu key
     EASYBITS_SANDBOX_ID   el id que devolvió el paso 1

3. Si tu app usa variables secretas:

   curl -X PUT https://www.easybits.cloud/api/v2/machines/SANDBOX_ID/secrets \\
     -H "Authorization: Bearer $EASYBITS_API_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{"DATABASE_URL":"..."}'

Desde ahí, cada push a main despliega.`);
}


// ─── ssh-proxy ───────────────────────────────────────────────────
//
// Se usa como ProxyCommand de ssh: mueve bytes entre stdin/stdout y un
// WebSocket contra el borde. Con esto `ssh caja.ghosty` entra a la microVM SIN
// que EasyBits abra un puerto por caja — el 443 pasa en redes donde un puerto
// alto no pasa (oficinas, VPN corporativa), que es de donde vienen los "no me
// conecta" imposibles de reproducir.
//
// El túnel NO autentica: la sesión SSH se autentica de punta a punta entre el
// cliente y el sshd de la caja. Aquí sólo se mueven bytes opacos.
//
// Node 22 trae `WebSocket` global, así que esto no añade ni una dependencia.
async function sshProxy() {
  const target = process.argv[3];
  if (!target) {
    console.error("uso: easybits ssh-proxy <sandboxId|caja.ghosty>");
    process.exit(2);
  }
  // Acepta `sb_xxx` o `sb_xxx.ghosty` (que es lo que ssh pasa como %h).
  const sandboxId = target.split(".")[0];

  const eb = await createClientFromEnv();
  const sb = await eb.sandboxes.get(sandboxId);
  const { url } = await sb.sshTicket();

  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  // Todo el diagnóstico va a stderr: stdout es el canal de SSH y cualquier byte
  // de más ahí corrompe el handshake.
  ws.onerror = () => {
    console.error("easybits ssh-proxy: no se pudo abrir el túnel");
    process.exit(1);
  };
  ws.onclose = () => process.exit(0);
  ws.onmessage = (ev: MessageEvent) => {
    const data = ev.data;
    process.stdout.write(
      typeof data === "string" ? Buffer.from(data) : Buffer.from(data as ArrayBuffer)
    );
  };
  await new Promise<void>((resolve) => (ws.onopen = () => resolve()));
  process.stdin.on("data", (chunk: Buffer) => ws.send(chunk));
  process.stdin.on("end", () => ws.close());
}

// ─── Router ──────────────────────────────────────────────────────

const [cmd, sub] = [process.argv[2], process.argv[3]];

switch (cmd) {
  case "login":
    login();
    break;
  case "files":
    if (sub === "list" || !sub) filesList();
    else if (sub === "upload") filesUpload();
    else if (sub === "delete") filesDelete();
    else console.error(`Unknown: files ${sub}`);
    break;
  case "providers":
    providersList();
    break;
  case "init":
    init();
    break;
  case "config":
    printMcpConfig();
    break;
  case "mcp":
    printMcpStdioConfig();
    break;
  case "ssh-proxy":
    sshProxy();
    break;
  case "help":
  case undefined:
    console.log(`easybits CLI — @easybits.cloud/cli

Commands:
  login <key>       Save API key
  init              Write the GitHub Actions deploy workflow
                    (--app-dir /srv/app, --port 3000)
  files list        List your files
  files upload <f>  Upload a file
  files delete <id> Delete a file
  providers list    Show storage providers
  config            Print MCP config JSON (streamable HTTP)
  mcp               Print MCP stdio config JSON
  ssh-proxy <id>    SSH tunnel over 443 (use as ssh ProxyCommand)

SSH to a box — add to ~/.ssh/config:
  Host *.ghosty
    ProxyCommand easybits ssh-proxy %h
    User root`);
    break;
  default:
    console.error(`Unknown command: ${cmd}. Run 'easybits help'`);
}
