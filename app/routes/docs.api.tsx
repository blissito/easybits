import { Link } from "react-router";
import type { Route } from "./+types/docs.api";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { ApiReference } from "~/components/docs/ApiReference";

// /docs/api — la spec OpenAPI (public/openapi.yaml, fuente de verdad a mano) renderizada con
// Scalar. «Try it» funciona pegando una API key en el candado: mismo origin, API real.
export const meta = () => [
  ...getBasicMetaTags({
    title: "Referencia OpenAPI — EasyBits API v2",
    description: "Especificación OpenAPI 3.1 de la REST API v2 de EasyBits: sandboxes, web, archivos, bases de datos, hosting, documentos y agentes. Con Try it.",
  }),
  { tagName: "link", rel: "canonical", href: "https://www.easybits.cloud/docs/api" },
  { tagName: "link", rel: "alternate", type: "application/yaml", href: "https://www.easybits.cloud/openapi.yaml" },
];

export const headers: Route.HeadersFunction = () => ({
  Link: '<https://www.easybits.cloud/openapi.yaml>; rel="service-desc"; type="application/yaml"',
});

export default function DocsApiPage() {
  return (
    <section className="min-h-screen bg-white">
      <nav className="border-b-2 border-black px-6 py-4 sticky top-0 bg-white z-50 flex items-center justify-between">
        <Link to="/docs" className="font-bold hover:underline">← Docs</Link>
        <div className="flex items-center gap-4 text-sm">
          <a href="/openapi.yaml" className="font-mono underline">openapi.yaml</a>
          <a href="/llms.txt" className="font-mono underline">llms.txt</a>
        </div>
      </nav>
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-2">Referencia OpenAPI</h1>
        <p className="text-gray-600 mb-6 text-sm">
          REST API v2, generada de <span className="font-mono">/openapi.yaml</span>. Pega tu API key
          (<Link to="/dash/developer" className="underline">Dashboard de Desarrollador</Link>) en el candado para probar contra tu cuenta.
          Un agente puede leer la spec directo o usar la tool <span className="font-mono">openapi</span> del MCP de docs.
        </p>
        <ApiReference />
      </div>
    </section>
  );
}
