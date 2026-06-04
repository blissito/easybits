// Mismo ejemplo de sandbox, pero con el SDK OFICIAL de MCP (no fetch a mano).
//
//   npm install @modelcontextprotocol/sdk
//   EASYBITS_API_KEY=eb_sk_live_... node examples/sandbox-mcp-sdk.mjs
//
// El MCP de easybits es un servidor Streamable-HTTP; el SDK trae el cliente + transporte.
// Los sandbox tools (sandbox_create, sandbox_run_code, ...) están en el grupo ?tools=sandbox.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const KEY = process.env.EASYBITS_API_KEY;

// Transporte Streamable-HTTP al MCP de easybits, con el Bearer en cada request.
const transport = new StreamableHTTPClientTransport(
  new URL("https://www.easybits.cloud/api/mcp?tools=sandbox"),
  { requestInit: { headers: { Authorization: `Bearer ${KEY}` } } },
);

const client = new Client({ name: "easybits-sandbox-example", version: "1.0.0" });
await client.connect(transport);

// (opcional) ver las tools disponibles del grupo sandbox
// console.log((await client.listTools()).tools.map((t) => t.name));

// helper: las tools de easybits devuelven su payload como JSON en content[0].text
const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return JSON.parse(res.content[0].text);
};

// --- equivalente al @e2b/code-interpreter --------------------------------

// 1) crear el sandbox (microVM Firecracker; kernel python | node | bun | bash)
const { sandboxId } = await call("sandbox_create", { template: "node", timeoutSeconds: 120 });
console.log("sandbox:", sandboxId);

// 2) ejecutar "celdas" de código en ese sandbox
await call("sandbox_run_code", { sandboxId, lang: "node", code: "globalThis.x = 1" });
const execution = await call("sandbox_run_code", {
  sandboxId,
  lang: "node",
  code: "x += 1; console.log(x)",
});

// → 2   (stdout del run-code)
console.log(execution.stdout.trim());

// 3) (opcional) exponer un puerto como URL pública (e2b getHost / Daytona getPreviewLink)
//    await call("sandbox_exec", { sandboxId, command: "python3 -m http.server 3000 &" });
//    const { url } = await call("sandbox_expose_port", { sandboxId, port: 3000 });

// 4) limpieza
await call("sandbox_destroy", { sandboxId });
await client.close();

// NOTA (confirmado): el run-code de sandbox-host arranca un proceso FRESCO por llamada
// (python3 -c / node -e / bash -c), NO un kernel persistente tipo e2b — `globalThis.x` no
// sobrevive entre celdas; mete las líneas dependientes en una sola, o persiste con
// sandbox_files_write / sandbox_files_read. (Kernel persistente: segunda tanda.)
