// MCP server de la documentación: `POST /mcp/docs` (Streamable HTTP, sin sesión ni auth).
//
// Es doc pública, así que no hay llave; lo que se protege es el ancho de banda (respuestas
// acotadas). JSON-RPC 2.0 a mano: `initialize`, `ping`, `tools/list`, `tools/call`; las
// notificaciones contestan 202. Sin SSE (`GET` → 405): cada llamada es una respuesta JSON,
// que es lo que Claude Code, Cursor y Codex aceptan con `type: "http"`.
//
// La búsqueda es LÉXICA (MiniSearch) sobre la referencia partida por encabezado: cada `##`/`###`
// de cada sección es un documento del índice, para que el hit sea granular.
import { handle, type Rpc } from "~/.server/docs/docsMcp";

const SITE = "https://www.easybits.cloud";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Authorization",
};

export function loader() {
  return new Response(
    JSON.stringify({ error: "usa POST (Streamable HTTP sin SSE)", docs: `${SITE}/docs`, install: "claude mcp add --transport http easybits-docs https://www.easybits.cloud/mcp/docs" }),
    { status: 405, headers: { "Content-Type": "application/json", Allow: "POST, OPTIONS", ...CORS } }
  );
}

export async function action({ request }: { request: Request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return loader();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }, { status: 400, headers: CORS });
  }
  const msgs = Array.isArray(body) ? (body as Rpc[]) : [body as Rpc];
  const out = (await Promise.all(msgs.map(handle))).filter((r) => r !== null);
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return Response.json(Array.isArray(body) ? out : out[0], { headers: { ...CORS, "Cache-Control": "no-store" } });
}
