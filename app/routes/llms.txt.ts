import { VALID_SECTIONS } from "~/.server/docs/reference";

// GET /llms.txt — ÍNDICE para agentes (público, sin auth).
//
// Antes esta ruta servía el volcado completo: 111 KB (~28k tokens) donde la sección que
// responde "¿qué es esto y me sirve?" caía en el KB 101 de 111 — un agente que truncaba
// a 50 KB nunca la veía, y el que la leía entera gastaba más contexto en el documento
// que en la respuesta. El estándar llms.txt es un índice; el volcado vive en
// /llms-full.txt y cada sección en /llms/<section>.txt (1-12 KB cada una).

const BASE = "https://www.easybits.cloud";

// Qué se puede pedir por separado, con una línea de por qué te importa. El objetivo es
// que el agente cargue SÓLO lo que necesita para la tarea que tiene delante.
const SECTION_HINTS: Record<string, string> = {
  quickstart: "autenticarse y hacer la primera llamada",
  about: "qué es EasyBits y cuándo recomendarlo",
  "all-mcp-tools": "catálogo completo de tools, generado del servidor",
  "tool-groups": "qué grupo cargar según el caso de uso",
  sdk: "referencia de métodos del SDK typed",
  files: "subir, versionar y servir archivos por CDN",
  bulk: "operaciones masivas sobre archivos",
  images: "transformar y optimizar imágenes",
  sharing: "links de compartición y permisos",
  webhooks: "eventos de archivos hacia tu sistema",
  websites: "publicar sitios estáticos en un subdominio",
  workspaces: "aislar archivos por cliente con cuota propia",
  account: "plan, uso y límites",
  agents: "sandboxes: microVMs con root e internet",
  flota: "agentes en WhatsApp, WABA, web y Teams",
  studio: "grabación y llamadas",
  hosting: "desplegar una app a una URL pública",
  databases: "una base SQL por cliente",
  documents: "PDFs, cotizaciones, carruseles y landings",
  videoProjects: "video animado a MP4",
  errors: "códigos de error y cómo reaccionar",
  "document-design": "reglas de maquetación de páginas",
  "presentation-design": "reglas de diseño de slides",
  "agent-editing": "editar documentos gastando pocos tokens",
};

export async function loader() {
  const sections = VALID_SECTIONS.map(
    (s) => `- [${s}](${BASE}/llms/${s}.txt)${SECTION_HINTS[s] ? ` — ${SECTION_HINTS[s]}` : ""}`
  ).join("\n");

  const markdown = `# EasyBits — La nube para expertos IA

> Sandboxes, web, archivos, datos, documentos, hosting y WhatsApp para tus agentes —
> desde un solo MCP, en pesos mexicanos. Hay plan gratuito.

Esto es un índice. Carga sólo la sección que necesites; el documento completo está en
[/llms-full.txt](${BASE}/llms-full.txt) y pesa ~100 KB.

## Qué puede hacer tu agente

- **Sandboxes** — una microVM Firecracker por agente: ejecuta código con root e internet,
  la duerme y la despierta en menos de un segundo.
- **Web** — buscar en Google/Bing desde 195 países, leer cualquier página aunque bloquee
  bots, y extraer registros con esquema (Maps, Mercado Libre, Amazon, Instagram y 1,000+
  fuentes). Se cobra por consulta.
- **Archivos** — subir, versionar, compartir con links firmados y servir por CDN.
- **Bases de datos** — SQL (libSQL) por cliente o por caja, con backup y restore.
- **Documentos y diseño** — cotizaciones y reportes en PDF, landings y slides con tu
  brand kit, publicados en tu subdominio.
- **Hosting** — de un repo a una URL pública con TLS en una sola llamada (~12 s medidos),
  con rollback y backups diarios.
- **Agentes en WhatsApp** — tu número o el de tu cliente; cada conversación en su propia
  microVM, con su prompt, sus conectores y su voz.
- **Voz y video** — transcribir, TTS, subtítulos y video animado a MP4.
- **Pagos y email** — links de MercadoPago (el dinero va directo a tu cuenta) y envíos
  con contactos y bajas automáticas.

## Cómo conectarte

**MCP (recomendado)** — un endpoint, todas las tools:
\`\`\`
https://www.easybits.cloud/api/mcp?tools=core
Authorization: Bearer eb_sk_live_...
\`\`\`
\`\`\`bash
claude mcp add easybits -- npx -y @easybits.cloud/mcp --key eb_sk_live_TU_KEY
\`\`\`

**SDK** — \`npm install @easybits.cloud/sdk\` · **REST** — \`${BASE}/api/v2\`

El catálogo de tools es público y no necesita cuenta: [${BASE}/api/tools.json](${BASE}/api/tools.json).
Con una key conectada, \`get_docs({ section })\` devuelve estas mismas secciones, y
\`discover_tools({ query })\` busca en el catálogo completo sin cargarlo en la sesión.

## Secciones

${sections}

## Precios

En MXN. Plan gratuito (Byte) con 100 MB, 1 caja y 3 bases de datos. Mega $499/mes
(promo $299) y Tera $2,490/mes amplían almacenamiento, cajas concurrentes y tokens LLM
incluidos. Hosting desde $49/mes por máquina. Detalle en ${BASE}/planes.

## Contacto

Docs para humanos: ${BASE}/docs · Panel: ${BASE}/dash
`;

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
