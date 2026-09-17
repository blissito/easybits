// /.well-known/api-catalog (RFC 9727): dónde está la descripción de nuestra API pública.
// `service-desc` → OpenAPI (fuente de verdad) y el catálogo de tools (JSON, sin auth);
// `service-meta` → llms.txt y el índice de skills; `service-doc` → la referencia legible.
const SITE = "https://www.easybits.cloud";

const BODY = {
  linkset: [
    {
      anchor: `${SITE}/.well-known/api-catalog`,
      item: [
        {
          href: `${SITE}/api/v2`,
          "service-desc": [
            { href: `${SITE}/openapi.yaml`, type: "application/yaml" },
            { href: `${SITE}/api/tools.json`, type: "application/json" },
          ],
          "service-doc": [
            { href: `${SITE}/docs/api`, type: "text/html", hreflang: "es" },
            { href: `${SITE}/en/docs`, type: "text/html", hreflang: "en" },
          ],
          "service-meta": [
            { href: `${SITE}/llms.txt`, type: "text/plain" },
            { href: `${SITE}/.well-known/agent-skills/index.json`, type: "application/json" },
          ],
        },
        {
          href: `${SITE}/api/mcp`,
          "service-desc": [{ href: `${SITE}/.well-known/mcp/server-card.json`, type: "application/json" }],
          "service-doc": [{ href: `${SITE}/mcp`, type: "text/html", hreflang: "es" }],
        },
      ],
    },
  ],
};

export function loader() {
  return new Response(JSON.stringify(BODY, null, 2), {
    headers: {
      "Content-Type": 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
