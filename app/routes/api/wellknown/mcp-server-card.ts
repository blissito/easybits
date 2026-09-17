// Tarjeta del MCP de EasyBits (SEP-2127, misma forma que server.json del registro MCP).
// Se sirve en `/.well-known/mcp-server-card` (la SEP) y en `/.well-known/mcp/server-card.json`
// (la ruta que comprueba el Agent Readiness de Cloudflare). Sólo metadatos de conexión: las
// tools se descubren en vivo con `tools/list`. Va el MCP de PRODUCTO (OAuth 2.1 o Bearer);
// el de docs sin auth se anuncia como segundo remoto.
const SITE = "https://www.easybits.cloud";

const CARD = {
  $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
  name: "cloud.easybits/easybits",
  title: "EasyBits — la nube para agentes de IA",
  version: "1.0.0",
  description:
    "Sandboxes (microVMs Firecracker), web (buscar, leer, extraer), archivos con CDN, bases SQL, documentos, hosting de apps y flota de agentes en WhatsApp/Teams. Auth: OAuth 2.1 o Bearer con API key; grupos de tools en el path (/api/mcp/core,sandbox). Documentación sin auth en /mcp/docs.",
  websiteUrl: `${SITE}/mcp`,
  remotes: [
    { type: "streamable-http", url: `${SITE}/api/mcp`, supportedProtocolVersions: ["2025-06-18"] },
    { type: "streamable-http", url: `${SITE}/mcp/docs`, supportedProtocolVersions: ["2025-06-18"] },
  ],
};

export function loader() {
  return new Response(JSON.stringify(CARD, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
