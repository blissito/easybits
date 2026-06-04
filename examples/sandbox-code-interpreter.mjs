// Equivalente al @e2b/code-interpreter, pero con la flota de sandboxes de easybits.
//
//   // npm install @e2b/code-interpreter
//   import { Sandbox } from '@e2b/code-interpreter'
//   const sandbox = await Sandbox.create()
//   await sandbox.runCode('x = 1')
//   const execution = await sandbox.runCode('x+=1; x')   // → 2
//
// easybits aún NO tiene SDK npm; el primitivo se usa por su MCP (JSON-RPC) o por REST.
// Aquí un helper mínimo sobre el MCP (~15 líneas) que te da casi la misma ergonomía.
//
//   EASYBITS_API_KEY=eb_sk_live_... node examples/sandbox-code-interpreter.mjs

const MCP = "https://www.easybits.cloud/api/mcp";
const KEY = process.env.EASYBITS_API_KEY;

// Llama una tool del MCP de easybits y devuelve su resultado ya parseado.
async function eb(name, args = {}) {
  const r = await fetch(MCP, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  // el MCP responde como SSE: "event: message\ndata: {...}". Tomamos el último data:.
  const txt = await r.text();
  const line = txt.split(/\r?\n/).filter((l) => l.startsWith("data:")).pop() || txt;
  const result = JSON.parse(line.replace(/^data:\s*/, "")).result;
  // las tools devuelven su payload como JSON dentro de content[0].text
  return JSON.parse(result.content[0].text);
}

// --- el equivalente al ejemplo de e2b -------------------------------------

// Crea un sandbox (microVM Firecracker aislado). Kernel a elegir: python | node | bun | bash.
const { sandboxId } = await eb("sandbox_create", {
  template: "node",
  timeoutSeconds: 120, // se auto-destruye tras inactividad
});
console.log("sandbox:", sandboxId);

// Ejecuta "celdas" de código en ese sandbox
await eb("sandbox_run_code", { sandboxId, lang: "node", code: "globalThis.x = 1" });
const execution = await eb("sandbox_run_code", {
  sandboxId,
  lang: "node",
  code: "x += 1; console.log(x)",
});

// → 2   (run-code corre en el MISMO sandbox; el stdout viene en execution.stdout)
console.log(execution.stdout.trim());

// Exponer un puerto como URL pública (equivalente a e2b getHost / Daytona getPreviewLink).
// Levanta tu server dentro del sandbox y luego expón el puerto:
//   await eb("sandbox_exec", { sandboxId, command: "python3 -m http.server 3000 &" });
//   const { url } = await eb("sandbox_expose_port", { sandboxId, port: 3000 });
//   console.log(url); // → https://sb-<uuid>-3000.sandboxes.easybits.cloud
// El sandboxId (no adivinable) es la capability; la URL vive mientras el sandbox corra.

// Limpieza (o déjalo morir por timeoutSeconds; usa sandbox_extend para alargarlo)
await eb("sandbox_destroy", { sandboxId });

// NOTA (confirmado): run-code arranca un proceso FRESCO por llamada (python3 -c / node -e /
// bash -c), NO un kernel persistente tipo e2b. `globalThis.x` NO sobrevive entre celdas —
// mete las líneas dependientes en UNA sola llamada, o persiste estado con sandbox_files_write
// + sandbox_files_read. (Kernel persistente = segunda tanda, pendiente en sandbox-host.)
