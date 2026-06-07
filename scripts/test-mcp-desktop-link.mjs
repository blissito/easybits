#!/usr/bin/env node
// Prueba e2e del MCP de easybits: comprueba que al spawnear un agente de escritorio
// (computer-ghosty-gemini por default) por la herramienta MCP `agent_create`,
// `agent_list` devuelve un `desktopUrl` (noVNC) que se abre en el NAVEGADOR SIN
// sesión/login — la única auth es el subdominio capability inadivinable. Es decir:
// el link de visualización del escritorio funciona aunque no tengamos sesión abierta.
//
// Flujo:
//   1. tools/call agent_create  → { sandboxId, ... }
//   2. tools/call agent_list (poll) → AgentRecord con status=running + desktopUrl
//   3. GET anónimo (sin Authorization, sin cookies) al desktopUrl → 200 + página noVNC
//   4. tools/call sandbox_destroy (cleanup)
//
// Uso:
//   EASYBITS_API_KEY=ek_... node scripts/test-mcp-desktop-link.mjs
//   Opcionales: MCP_BASE (default https://easybits.fly.dev), TEMPLATE
//   (default computer-ghosty-gemini), GOOGLE_GENERATIVE_AI_API_KEY (la caja
//   levanta el escritorio aun SIN key — el cerebro Gemini es irrelevante para
//   este test; el escritorio es independiente del agente).

const MCP_BASE = process.env.MCP_BASE || "https://easybits.fly.dev";
// agent_create / agent_list / sandbox_destroy viven en el grupo "sandbox" (no en
// el "core" por default) → hay que pedirlo con ?tools=sandbox, si no el MCP
// responde "Tool agent_create disabled".
const MCP_TOOLS = process.env.MCP_TOOLS || "sandbox";
const MCP_URL = `${MCP_BASE.replace(/\/$/, "")}/api/mcp?tools=${encodeURIComponent(MCP_TOOLS)}`;
const API_KEY = process.env.EASYBITS_API_KEY || process.env.EASYBITS_DEFAULT_API_KEY;
const TEMPLATE = process.env.TEMPLATE || "computer-ghosty-gemini";
const POLL_TIMEOUT_MS = 210_000; // el bring-up del escritorio + expose de :6080 puede tardar

if (!API_KEY) {
  console.error("✗ Falta EASYBITS_API_KEY (o EASYBITS_DEFAULT_API_KEY) en el entorno.");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// El MCP es streamable-HTTP stateless: un POST por llamada, respuesta en SSE
// (`event: message\n data: {jsonrpc...}`). Parseamos la línea data.
let rpcId = 0;
async function rpc(method, params) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const text = await res.text();
  if (!res.ok && !text.includes("data:")) {
    throw new Error(`MCP ${method} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  // Extrae el último JSON de las líneas `data:` (SSE) o el body JSON plano.
  let payload = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^data:\s*(.+)$/);
    if (m) { try { payload = JSON.parse(m[1]); } catch {} }
  }
  if (!payload) { try { payload = JSON.parse(text); } catch {} }
  if (!payload) throw new Error(`MCP ${method}: respuesta no parseable: ${text.slice(0, 300)}`);
  if (payload.error) throw new Error(`MCP ${method} error: ${JSON.stringify(payload.error)}`);
  return payload.result;
}

// tools/call → el resultado real viene serializado en content[0].text (JSON).
async function callTool(name, args) {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result?.isError) {
    throw new Error(`tool ${name} isError: ${JSON.stringify(result.content)}`);
  }
  const textPart = (result?.content || []).find((c) => c.type === "text");
  if (!textPart) return result;
  try { return JSON.parse(textPart.text); } catch { return textPart.text; }
}

async function main() {
  console.log(`▶ MCP: ${MCP_URL}`);
  console.log(`▶ template: ${TEMPLATE}\n`);

  // 1) Spawn por la herramienta MCP. La key de Gemini es opcional: el escritorio
  //    (Xvfb/XFCE/noVNC) levanta igual; aquí probamos el LINK, no el cerebro.
  const env = {};
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  console.log("① agent_create…");
  const created = await callTool("agent_create", {
    template: TEMPLATE,
    name: "mcp-desktop-link-test",
    env,
    timeoutSeconds: 600,
  });
  const sandboxId = created.sandboxId;
  if (!sandboxId) throw new Error(`agent_create no devolvió sandboxId: ${JSON.stringify(created)}`);
  console.log(`   sandboxId = ${sandboxId}`);

  let ok = false, desktopUrl = null;
  try {
    // 2) Poll agent_list hasta status=running + desktopUrl.
    console.log("② esperando status=running + desktopUrl (agent_list)…");
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let lastStatus = "";
    while (Date.now() < deadline) {
      const agents = await callTool("agent_list", {});
      const a = (Array.isArray(agents) ? agents : []).find((x) => x.sandboxId === sandboxId);
      if (a) {
        if (a.status !== lastStatus) { console.log(`   status=${a.status} desktopUrl=${a.desktopUrl ? "sí" : "—"}`); lastStatus = a.status; }
        if (a.desktopUrl) { desktopUrl = a.desktopUrl; break; }
        if (a.status === "error" || a.status === "lost") throw new Error(`agente quedó en status=${a.status}`);
      }
      await sleep(5000);
    }
    if (!desktopUrl) throw new Error("timeout: nunca apareció desktopUrl");
    console.log(`   desktopUrl = ${desktopUrl}`);

    // Aserción de forma: subdominio capability sb-<id>-6080.sandboxes…
    const hostOk = /:\/\/sb-[^/]+-6080\.sandboxes\./.test(desktopUrl) && /vnc\.html/.test(desktopUrl);
    console.log(`   ${hostOk ? "✓" : "✗"} forma de URL (sb-…-6080 + vnc.html)`);

    // 3) GET ANÓNIMO: sin Authorization, sin cookies. Si requiriera sesión daría 401/403.
    console.log("③ GET anónimo al desktopUrl (sin login)…");
    const r = await fetch(desktopUrl, { redirect: "follow", headers: { "Accept": "text/html" } });
    const body = await r.text();
    const isNoVNC = /noVNC|novnc|vnc\.html|UI\.|canvas/i.test(body);
    const notAuthGated = r.status !== 401 && r.status !== 403;
    console.log(`   HTTP ${r.status} · ${body.length} bytes · noVNC=${isNoVNC ? "sí" : "no"} · auth-gated=${notAuthGated ? "no" : "SÍ"}`);

    ok = hostOk && r.ok && isNoVNC && notAuthGated;
    console.log(`\n${ok ? "✅ PASS" : "❌ FAIL"} — el escritorio se visualiza en el navegador ${ok ? "SIN sesión (subdominio capability = la auth)." : "NO cumplió las aserciones."}`);
  } finally {
    // 4) Cleanup — no dejar la caja facturando.
    try { await callTool("sandbox_destroy", { sandboxId }); console.log(`\n🧹 sandbox_destroy ${sandboxId} ok`); }
    catch (e) { console.log(`\n⚠️  cleanup falló (${e.message}); destruye manual: sandbox_destroy ${sandboxId}`); }
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(`\n✗ ERROR: ${e.message}`); process.exit(1); });
