import { Link, useLocation } from "react-router";
import type { Route } from "./+types/docs";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { useState, useEffect, useRef } from "react";
import { CodeBlock } from "~/components/mdx/CodeBlock";
import { FLEET_BOX, HOSTING_CATALOG, SELLABLE_TIERS } from "~/lib/hostingCatalog";

// Formato humano de specs de un tier (MB → GB/MB legible).
const fmtRam = (mb: number) => (mb >= 1024 ? `${mb / 1024}GB` : `${mb}MB`);
const fmtPrice = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("en-US")}`);

export const meta = () => [
  ...getBasicMetaTags({
    title: "EasyBits API Docs — Agentic-First File Storage",
    description: "Complete API reference for the EasyBits REST API v2. 100+ endpoints for AI agents to manage files, webhooks, and storage.",
  }),
  { tagName: "link", rel: "canonical", href: "https://www.easybits.cloud/docs" },
];

const SECTIONS = [
  { id: "quickstart", label: "Inicio rápido" },
  { id: "auth", label: "Autenticación" },
  { id: "ghosty-code", label: "Ghosty Code" },
  { id: "cowork", label: "Claude Cowork" },
  { id: "sdk", label: "SDK" },
  { id: "files", label: "Archivos" },
  { id: "bulk", label: "Operaciones en lote" },
  { id: "images", label: "Imágenes" },
  { id: "sharing", label: "Compartir" },
  { id: "forms", label: "Formularios" },
  { id: "webhooks", label: "Webhooks" },
  { id: "payments", label: "Pagos" },
  { id: "email", label: "Email & Broadcasts" },
  { id: "websites", label: "Sitios web" },
  { id: "documents", label: "Documentos" },
  { id: "agents", label: "Agentes & Sandboxes" },
  { id: "flota", label: "Flota" },
  { id: "hosting", label: "Sandboxes permanentes" },
  { id: "databases", label: "Bases de datos" },
  { id: "secrets", label: "Secretos" },
  { id: "calls", label: "Llamadas" },
  { id: "account", label: "Cuenta & Uso" },
  { id: "errors", label: "Errores & Límites" },
  { id: "tool-groups", label: "Tool Groups" },
] as const;

export default function DocsPage() {
  const location = useLocation();

  // Estado inicial DETERMINISTA (igual en server y cliente) para no causar un
  // hydration mismatch: leer location.hash aquí daba "quickstart" en SSR y la
  // sección real en cliente → React dejaba el <a> de "Inicio rápido" con su
  // clase activa huérfana (DOS ítems negros en dev). El hash lo aplica el
  // useEffect([location.hash]) de abajo, ya en cliente.
  const [activeSection, setActiveSection] = useState("quickstart");

  useEffect(() => {
    const hash = location.hash.replace("#", "");
    if (hash && SECTIONS.some((s) => s.id === hash)) {
      setActiveSection(hash);
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
    }
  }, [location.hash]);

  // Scrollspy a prueba de contenedor: un loop requestAnimationFrame que SONDEA
  // la posición de las secciones y solo recalcula cuando algo se movió. No
  // depende de eventos de scroll (no disparan si el scroll vive en un contenedor
  // anidado) ni de IntersectionObserver (se atora en secciones altas). La sección
  // activa es aquella cuyo rango [top, bottom] cruza la LÍNEA de activación; en
  // los huecos entre secciones, la más cercana por arriba. Elección por posición
  // REAL en el DOM, así que es independiente del orden del array SECTIONS.
  useEffect(() => {
    const LINE = 100; // px desde el tope del viewport
    let raf = 0, lastId: string | null = null, stop = false;

    const pick = () => {
      let inSpan: string | null = null;
      let aboveBest: string | null = null, aboveTop = -Infinity;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= LINE && r.bottom > LINE) inSpan = s.id;            // la línea cae dentro
        if (r.top <= LINE && r.top > aboveTop) { aboveTop = r.top; aboveBest = s.id; } // más cercana por arriba
      }
      const next = inSpan ?? aboveBest ?? SECTIONS[0].id;
      // Solo re-render cuando cambia la sección activa (no en cada frame).
      if (next !== lastId) { lastId = next; setActiveSection(next); }
    };

    // ⚠️ NO "optimices" esto a un trigger/gate (scroll listener, probe del top de
    // una sección, IntersectionObserver). Ya se intentó varias veces y SIEMPRE
    // reintroduce el bug "scrollspy pegado en Inicio rápido": al añadir/editar
    // secciones, el resaltado de código async (CodeBlock), fuentes e imágenes
    // mueven las secciones DESPUÉS de la medición inicial; si pick() no corre en
    // ese instante, el highlight se queda atorado. La única versión estable es
    // medir por posición real en CADA frame. 23 getBoundingClientRect/frame es
    // trivial y `lastId` evita re-renders. Ver memory/project_docs_scrollspy_fragile.md.
    // (Requisito extra: el orden del DOM de las <section> DEBE coincidir con el
    //  orden del array SECTIONS, o el highlight se desincroniza por posición.)
    const loop = () => {
      if (stop) return;
      pick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { stop = true; cancelAnimationFrame(raf); };
  }, []);

  return (
    <section className="min-h-screen bg-white">
      {/* JSON-LD: WebAPI + SoftwareApplication for LLM/search discovery */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebAPI",
                name: "EasyBits API",
                description: "Agentic-first file storage REST API. 100+ endpoints for AI agents to manage, share, and transform files.",
                url: "https://www.easybits.cloud/docs",
                documentation: "https://www.easybits.cloud/docs",
                provider: {
                  "@type": "Organization",
                  name: "EasyBits",
                  url: "https://www.easybits.cloud",
                },
                termsOfService: "https://www.easybits.cloud/terminos-y-condiciones",
                category: ["File Storage", "AI Agent Tools", "MCP Server"],
              },
              {
                "@type": "SoftwareApplication",
                name: "@easybits.cloud/sdk",
                applicationCategory: "DeveloperApplication",
                operatingSystem: "Node.js, Bun, Deno",
                description: "Typed SDK for AI agents to manage files via the EasyBits API v2. Includes webhooks, bulk operations, image transforms, and static site hosting.",
                url: "https://www.npmjs.com/package/@easybits.cloud/sdk",
                offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
                provider: {
                  "@type": "Organization",
                  name: "EasyBits",
                  url: "https://www.easybits.cloud",
                },
              },
              {
                "@type": "SoftwareApplication",
                name: "@easybits.cloud/mcp",
                applicationCategory: "DeveloperApplication",
                description: "MCP server with 100+ tools for AI agents (12 core by default) to store, manage, and consume files. Works with Claude, ChatGPT, and any MCP-compatible client.",
                url: "https://www.npmjs.com/package/@easybits.cloud/mcp",
                offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
                provider: {
                  "@type": "Organization",
                  name: "EasyBits",
                  url: "https://www.easybits.cloud",
                },
              },
              {
                "@type": "TechArticle",
                headline: "Documentación de la API de EasyBits",
                description: "Referencia completa de la REST API v2 de EasyBits. Archivos, webhooks, sitios web, operaciones en lote, transformación de imágenes y SDK.",
                url: "https://www.easybits.cloud/docs",
                author: { "@type": "Organization", name: "EasyBits" },
                about: [
                  { "@type": "Thing", name: "File Storage API" },
                  { "@type": "Thing", name: "MCP Server" },
                  { "@type": "Thing", name: "AI Agent Tools" },
                ],
              },
            ],
          }),
        }}
      />

      {/* Nav */}
      <nav className="border-b-2 border-black px-6 py-4 sticky top-0 bg-white z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/inicio" className="flex items-center gap-2">
            <img src="/icons/easybits-logo.svg" alt="EasyBits" className="w-8 h-8" />
            <span className="font-bold text-xl">EasyBits</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/developers" className="text-sm font-medium hover:underline">
              For Developers
            </Link>
            <Link to="/status" className="text-sm font-medium hover:underline">
              Status
            </Link>
            <Link to="/blog" className="text-sm font-medium hover:underline">
              Blog
            </Link>
            <Link
              to="/login"
              className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold border-2 border-black hover:translate-y-[-2px] transition-transform"
            >
              Iniciar sesion
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto flex">
        {/* Sidebar */}
        <aside className="hidden md:block w-56 shrink-0 border-r-2 border-black sticky top-[57px] self-start p-4">
          <h2 className="font-bold text-xs uppercase text-gray-500 mb-3">
            API Reference
          </h2>
          <nav className="space-y-1">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setActiveSection(s.id)}
                aria-current={activeSection === s.id ? "true" : undefined}
                className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-sm ${
                  activeSection === s.id
                    ? "bg-black text-white font-bold"
                    : "hover:bg-gray-100"
                }`}
              >
                <span>{s.label}</span>
                {s.id === "flota" && (
                  <span className={`text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 leading-none ${
                    activeSection === s.id ? "bg-white text-black" : "bg-brand-500 text-white"
                  }`}>Nuevo</span>
                )}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 px-6 md:px-12 py-10 max-w-4xl [&_section[id]]:scroll-mt-20">
          {/* Quick Start */}
          <section id="quickstart" className="mb-16">
            <h1 className="text-3xl font-bold mb-2">Documentación de la API</h1>
            <p className="text-gray-500 mb-4 text-sm">Almacenamiento de archivos agentic-first para desarrolladores y agentes de IA</p>
            <p className="text-gray-600 mb-4">
              URL base: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-sm">https://www.easybits.cloud/api/v2</code>
            </p>
            <div className="mb-6 bg-blue-50 border-2 border-blue-300 rounded-xl p-4 text-sm">
              <strong>3 formas de integrarte:</strong> REST API (abajo),{" "}
              <a href="#sdk" className="underline font-medium">SDK tipado</a> ({`npm i @easybits.cloud/sdk`}), o{" "}
              <a href="https://www.npmjs.com/package/@easybits.cloud/mcp" className="underline font-medium" target="_blank" rel="noreferrer">servidor MCP</a> (100+ herramientas para agentes, 12 core por defecto).
            </div>

            <h2 className="text-xl font-bold mb-4">Inicio rápido</h2>
            <ol className="list-decimal list-inside space-y-3 text-gray-700 mb-6">
              <li>Crea una cuenta en <Link to="/login" className="underline font-medium">easybits.cloud</Link></li>
              <li>Ve al <Link to="/dash/developer" className="underline font-medium">Dashboard de Desarrollador</Link> y crea una API key</li>
              <li>Haz tu primera llamada:</li>
            </ol>
            <TabbedCode
              tabs={[
                { label: "Ghosty Code", code: `# Ghosty Code trae el MCP de EasyBits preconfigurado.
npm install -g ghostycode
ghosty auth set --provider easybits --api-key "TU_EASYBITS_API_KEY"
ghosty --yolo` },
                { label: "Claude Code", code: `claude mcp add easybits -- npx -y @easybits.cloud/mcp --key eb_sk_live_YOUR_KEY` },
                { label: "curl", code: `curl -H "Authorization: Bearer eb_sk_live_YOUR_KEY" \\
  https://www.easybits.cloud/api/v2/files` },
                { label: "SDK", code: `import { EasybitsClient } from "@easybits.cloud/sdk";

const eb = new EasybitsClient({ apiKey: "eb_sk_live_YOUR_KEY" });
const { items } = await eb.listFiles();` },
                { label: "Streamable HTTP", code: `{
  "mcpServers": {
    "easybits": {
      "type": "streamable-http",
      "url": "https://www.easybits.cloud/api/mcp",
      "headers": {
        "Authorization": "Bearer eb_sk_live_YOUR_KEY"
      }
    }
  }
}` },
              ]}
            />
            <p className="text-gray-500 text-xs mt-3">
              <Link to="/dash/developer" className="underline font-medium">Obtén tu API key</Link>.{" "}
              Por defecto cargan 12 herramientas core. Agrega <code className="bg-gray-100 px-1 rounded">--tools docs,slides,all</code> para más.{" "}
              <a href="#tool-groups" className="underline">Ver tool groups</a>.
            </p>
          </section>

          {/* Authentication */}
          <section id="auth" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Authentication</h2>
            <p className="text-gray-600 mb-4">
              All API requests require a Bearer token in the Authorization header.
            </p>
            <TabbedCode
              tabs={[
                { label: "Header", code: `Authorization: Bearer eb_sk_live_YOUR_API_KEY` },
                { label: "SDK", code: `import { EasybitsClient } from "@easybits.cloud/sdk";

// Explicit
const eb = new EasybitsClient({ apiKey: "eb_sk_live_..." });

// From env (EASYBITS_API_KEY) or ~/.easybitsrc
import { createClientFromEnv } from "@easybits.cloud/sdk";
const eb = await createClientFromEnv();` },
              ]}
            />
            <div className="mt-6">
              <h3 className="text-lg font-bold mb-2">What your key grants access to</h3>
              <p className="text-gray-600 text-sm mb-4">
                An EasyBits API key authenticates you as the owner of your account. It grants access to{" "}
                <strong>all your resources</strong>: files, websites, databases, webhooks, documents, presentations, and landings.
                Keep it secret — anyone with your key can read, modify, or delete your data.
              </p>

              <h3 className="text-lg font-bold mb-3">Scopes</h3>
              <p className="text-gray-600 text-sm mb-3">
                Each key is created with one or more scopes. Use the most restrictive scope your integration needs.
              </p>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm border-2 border-black rounded-xl overflow-hidden">
                  <thead className="bg-black text-white">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs uppercase">Scope</th>
                      <th className="text-left px-4 py-2 text-xs uppercase">Allows</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-gray-200">
                      <td className="px-4 py-2 font-mono text-xs font-bold">READ</td>
                      <td className="px-4 py-2 text-xs text-gray-600">List and get files, websites, documents, webhooks, and usage stats</td>
                    </tr>
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs font-bold">WRITE</td>
                      <td className="px-4 py-2 text-xs text-gray-600">Create, upload, update, optimize, transform, and share files. Create websites, webhooks, databases, documents, and presentations</td>
                    </tr>
                    <tr className="border-t border-gray-200">
                      <td className="px-4 py-2 font-mono text-xs font-bold">DELETE</td>
                      <td className="px-4 py-2 text-xs text-gray-600">Soft-delete and permanently remove files, websites, webhooks, and other resources</td>
                    </tr>
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs font-bold">ADMIN</td>
                      <td className="px-4 py-2 text-xs text-gray-600">Full access including key management, provider configuration, sandbox/agent operations, and account-wide actions</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400">
                Keys created from the Developer Dashboard default to READ + WRITE + DELETE. Use the API to create scoped keys programmatically.
              </p>
            </div>
            <div className="mt-4 bg-indigo-50 border-2 border-indigo-300 rounded-xl p-4 text-sm">
              <strong>Web clients (Claude.ai / Cowork):</strong> use OAuth 2.1 + Dynamic Client Registration instead of an API key. <a href="#cowork" className="underline font-medium">See the Claude Cowork section →</a>
            </div>
          </section>

          {/* Ghosty Code */}
          <section id="ghosty-code" className="mb-16">
            <h2 className="text-2xl font-bold mb-2">Ghosty Code</h2>
            <p className="text-gray-500 mb-3 text-sm">El runtime agéntico con EasyBits preinstalado. Cero configuración.</p>

            <div className="flex flex-wrap gap-3 mb-4 text-sm">
              <a href="https://www.npmjs.com/package/ghostycode" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 border-2 border-black rounded-lg px-3 py-1.5 font-medium hover:bg-gray-50">
                <span>📦</span> npm: ghostycode
              </a>
              <a href="https://github.com/blissito/ghostycode" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 border-2 border-black rounded-lg px-3 py-1.5 font-medium hover:bg-gray-50">
                <span>⌥</span> GitHub: blissito/ghostycode
              </a>
            </div>

            <div className="mb-6 bg-black text-white border-2 border-black rounded-xl p-5">
              <p className="text-sm mb-1 text-gray-300">Ghosty Code trae el MCP de EasyBits preconfigurado.</p>
              <p className="text-sm text-gray-400">Viene desactivado de fábrica hasta que añades tu API key — una instalación nueva nunca falla por falta de credencial.</p>
            </div>

            <h3 className="text-lg font-bold mb-3">Conexión en 3 pasos</h3>
            <ol className="list-decimal list-inside space-y-2 text-gray-700 mb-4 text-sm">
              <li>Instala el CLI: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">npm install -g ghostycode</code> (o <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">curl -fsSL https://formmy.app/ghosty/install.sh | sh</code>)</li>
              <li>Autentica con tu key de EasyBits (sirve para LLM + MCP): <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">ghosty auth set --provider easybits --api-key "TU_EASYBITS_API_KEY"</code></li>
              <li>Ejecuta: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">ghosty --yolo</code></li>
            </ol>
            <p className="text-xs text-gray-400 mb-4">
              Consigue tu API key en{" "}
              <a href="/dash/developer" className="underline">/dash/developer</a>. Verifica el setup con <code className="bg-gray-100 px-1 rounded">ghosty doctor</code> y los MCPs con <code className="bg-gray-100 px-1 rounded">ghosty mcp list</code>.
            </p>

            <h3 className="text-lg font-bold mb-3">Agregar EasyBits manualmente</h3>
            <p className="text-sm text-gray-600 mb-3">
              Si necesitas (re)agregar el servidor MCP con tu key:
            </p>
            <TabbedCode
              tabs={[
                { label: "ghosty mcp", code: `# 1. Agregar el servidor con tu key (esto lo activa)
ghosty mcp add easybits \\
  --url "https://www.easybits.cloud/api/mcp?tools=all" \\
  --bearer TU_EASYBITS_API_KEY

# 2. Verifica
ghosty mcp list

# 3. Listo
ghosty --yolo` },
              ]}
            />

            <h3 className="text-lg font-bold mb-3">Qué incluye</h3>
            <div className="grid md:grid-cols-2 gap-3 mb-6">
              {[
                ["⚡", "EasyBits MCP", "100+ herramientas para archivos, documentos, DBs, sandboxes y más"],
                ["🧠", "DeepSeek V4", "Modelo principal con razonamiento profundo (thinking tokens)"],
                ["🌐", "Búsqueda web", "BrightData integrado para búsquedas y scraping"],
                ["🔌", "MCP dinámico", "Agrega y quita servidores MCP en runtime sin reiniciar"],
                ["📦", "Sandboxes", "Firecracker microVMs para ejecutar código y agentes aislados"],
                ["🔄", "Auto-actualización", "ghosty update para mantener todo al día"],
              ].map(([icon, title, desc]) => (
                <div key={title} className="border-2 border-black rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{icon}</span>
                    <span className="font-bold text-sm">{title}</span>
                  </div>
                  <p className="text-xs text-gray-600">{desc}</p>
                </div>
              ))}
            </div>

            <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 text-sm mb-4">
              <strong>¿Ya usas Ghosty Code?</strong> Mantén el binario al día con{" "}
              <code className="bg-gray-100 px-1 rounded">ghosty update</code> — el MCP de EasyBits ya viene preconfigurado.
            </div>

            <p className="text-xs text-gray-400">
              ¿No usas Ghosty Code? EasyBits funciona con{" "}
              <a href="#cowork" className="underline">Claude Cowork</a>, Cursor, VS Code y cualquier cliente MCP.{" "}
              <a href="/mcp" className="underline">Ver todas las opciones de conexión</a>.
            </p>
          </section>

          {/* Cowork / OAuth */}
          <section id="cowork" className="mb-16">
            <h2 className="text-2xl font-bold mb-2">Claude Cowork (OAuth)</h2>
            <p className="text-gray-500 mb-4 text-sm">For Claude.ai, Cowork, and other web-based MCP clients that can't store API keys.</p>
            <p className="text-gray-600 mb-4 text-sm">
              EasyBits implements <strong>OAuth 2.1</strong> with <strong>Dynamic Client Registration</strong> (RFC 7591) and <strong>PKCE S256</strong>. Web MCP clients discover, register, and authenticate automatically — no API key copying, no JSON configs.
            </p>

            <h3 className="text-lg font-bold mb-3">Connect in 4 steps</h3>
            <ol className="list-decimal list-inside space-y-2 text-gray-700 mb-6 text-sm">
              <li>In Cowork, open <strong>Settings → Connectors → Add custom connector</strong></li>
              <li>Paste the MCP URL: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">https://www.easybits.cloud/api/mcp</code></li>
              <li>Click <strong>Connect</strong> — you'll be redirected to EasyBits to log in</li>
              <li>Authorize the connector. You're done — the agent has access to your workspace</li>
            </ol>

            <div className="mb-6 bg-green-50 border-2 border-green-300 rounded-xl p-4 text-sm">
              <strong>Tip:</strong> append <code className="bg-gray-100 px-1 rounded">?tools=all</code> to the URL to expose all 100+ tools instead of the 12-tool core group. See <a href="#tool-groups" className="underline">Tool Groups</a> for other options.
            </div>

            <h3 className="text-lg font-bold mb-3">How it works</h3>
            <p className="text-gray-600 mb-3 text-sm">
              EasyBits exposes the standard OAuth discovery endpoints so any spec-compliant MCP client connects without manual setup:
            </p>

            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm border-2 border-black rounded-xl overflow-hidden">
                <thead className="bg-black text-white">
                  <tr>
                    <th className="text-left px-4 py-2">Endpoint</th>
                    <th className="text-left px-4 py-2">Spec</th>
                    <th className="text-left px-4 py-2">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["/.well-known/oauth-protected-resource", "RFC 9728", "Tells clients which Authorization Server protects /api/mcp"],
                    ["/.well-known/oauth-authorization-server", "RFC 8414", "Advertises authorize, token, and registration endpoints"],
                    ["/oauth/register", "RFC 7591", "Dynamic Client Registration — client_id + secret issued on POST"],
                    ["/oauth/authorize", "OAuth 2.1", "User consent + code issuance (PKCE S256 required)"],
                    ["/oauth/token", "OAuth 2.1", "Exchanges code + verifier for a 1-hour JWT access token"],
                  ].map(([endpoint, spec, desc]) => (
                    <tr key={endpoint} className="border-t border-gray-200">
                      <td className="px-4 py-2 font-mono text-xs">{endpoint}</td>
                      <td className="px-4 py-2 text-xs text-gray-500">{spec}</td>
                      <td className="px-4 py-2 text-gray-600 text-xs">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="text-lg font-bold mb-3">Handshake flow</h3>
            <CodeExample
              title="Flow"
              code={`1. Client → GET /api/mcp (no token)
2. EasyBits → 401 + WWW-Authenticate (pointer to AS metadata)
3. Client → GET /.well-known/oauth-protected-resource
4. Client → GET /.well-known/oauth-authorization-server
5. Client → POST /oauth/register { redirect_uris, client_name }
                ← { client_id, client_secret }
6. Browser opens /oauth/authorize?client_id=...&code_challenge=... (S256)
7. User logs in (if no session) → code issued → redirect back to client
8. Client → POST /oauth/token with code + code_verifier
                ← { access_token (JWT), expires_in: 3600 }
9. Client → POST /api/mcp with Authorization: Bearer <access_token>`}
            />

            <h3 className="text-lg font-bold mt-8 mb-3">Notes</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 mb-6">
              <li>Access tokens are <strong>HS256 JWTs</strong>, valid for 1 hour. No refresh token — reauthorize is a single click when you already have a session.</li>
              <li><strong>Auto-approval</strong>: once logged in, the authorize screen redirects back immediately. The user already expressed consent by initiating the flow from the connector.</li>
              <li><strong>Additive</strong>: API key Bearer auth keeps working unchanged. The handler tries JWT verification first and silently falls through to API key validation.</li>
              <li><strong>PKCE S256 is mandatory</strong>. Plain and no-PKCE flows are rejected.</li>
              <li>Scope: a single <code className="bg-gray-100 px-1 rounded">mcp</code> scope — the authorized session has full access to the MCP handler.</li>
            </ul>

            <div className="text-sm text-gray-500">
              Deep dive in the{" "}
              <Link to="/blog/oauth-mcp-claude-cowork" className="font-medium underline hover:no-underline">
                OAuth 2.1 + DCR blog post
              </Link>.
            </div>
          </section>

          {/* SDK */}
          <section id="sdk" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">SDK</h2>
            <p className="text-gray-600 mb-4 text-sm">
              El SDK tipado envuelve toda la REST API. Instálalo y úsalo en cualquier proyecto Node.js/Bun/Deno.
            </p>
            <CodeExample title="Instalar" code="npm install @easybits.cloud/sdk" />

            <h3 className="text-lg font-bold mt-8 mb-4">Todos los métodos</h3>

            <SdkMethodTable title="Archivos" methods={[
              ["listFiles(params?)", "Lista archivos (paginado)"],
              ["getFile(fileId)", "Obtén el archivo + URL de descarga"],
              ["uploadFile(params)", "Crea el archivo + obtén URL de subida"],
              ["updateFile(fileId, params)", "Actualiza nombre, acceso, metadata, status"],
              ["deleteFile(fileId)", "Borrado suave (retención 7 días)"],
              ["restoreFile(fileId)", "Restaura desde la papelera"],
              ["listDeletedFiles(params?)", "Lista la papelera con días hasta la purga"],
              ["searchFiles(query)", "Búsqueda en lenguaje natural con IA"],
              ["duplicateFile(fileId, name?)", "Copia el archivo (nuevo objeto de storage)"],
              ["listPermissions(fileId)", "Lista los permisos de compartición"],
            ]} />

            <SdkMethodTable title="Operaciones en lote" methods={[
              ["bulkUploadFiles(items)", "Sube hasta 20 archivos a la vez"],
              ["bulkDeleteFiles(fileIds)", "Borra hasta 100 archivos a la vez"],
            ]} />

            <SdkMethodTable title="Imágenes" methods={[
              ["optimizeImage(params)", "Convierte a WebP/AVIF"],
              ["transformImage(params)", "Redimensiona, rota, voltea, convierte, escala de grises"],
            ]} />

            <SdkMethodTable title="Compartir" methods={[
              ["shareFile(params)", "Comparte con otro usuario por email"],
              ["generateShareToken(fileId, expiresIn?)", "URL de descarga temporal"],
              ["listShareTokens(params?)", "Lista tokens (paginado)"],
            ]} />

            <SdkMethodTable title="Formularios" methods={[
              ["createForm(params)", "Crea un formulario hospedado (/f/:slug)"],
              ["listForms()", "Lista tus formularios con conteo de respuestas"],
              ["getFormSubmissions(formId, opts?)", "Lista las respuestas de un formulario"],
            ]} />

            <SdkMethodTable title="Webhooks" methods={[
              ["listWebhooks()", "Lista los webhooks configurados"],
              ["createWebhook(params)", "Crea un webhook (devuelve el secret una vez)"],
              ["getWebhook(webhookId)", "Obtén los detalles del webhook"],
              ["updateWebhook(webhookId, params)", "Actualiza URL, eventos o status"],
              ["deleteWebhook(webhookId)", "Borra permanentemente"],
            ]} />

            <SdkMethodTable title="Sitios web" methods={[
              ["listWebsites()", "Lista los sitios estáticos"],
              ["createWebsite(name)", "Crea un sitio, obtén id + URL"],
              ["getWebsite(websiteId)", "Obtén los detalles del sitio"],
              ["updateWebsite(websiteId, params)", "Actualiza nombre/status"],
              ["deleteWebsite(websiteId)", "Borra el sitio + archivos"],
            ]} />
            <p className="text-xs text-gray-500 -mt-4 mb-6">
              Despliega archivos subiéndolos con <code className="bg-gray-100 px-1 rounded">fileName: "sites/&#123;websiteId&#125;/path"</code> — ve la <a href="#websites" className="underline">sección Sitios web</a> para el ejemplo completo.
            </p>

            <SdkMethodTable title="Cuenta" methods={[
              ["getUsageStats()", "Storage, conteo de archivos, info del plan"],
              ["listProviders()", "Proveedores de storage"],
              ["listKeys()", "API keys"],
            ]} />

            <h3 className="text-lg font-bold mt-8 mb-4">Manejo de errores</h3>
            <CodeExample title="SDK" code={`import { EasybitsError } from "@easybits.cloud/sdk";

try {
  await eb.getFile("nonexistent");
} catch (err) {
  if (err instanceof EasybitsError) {
    console.log(err.status); // 404
    console.log(err.body);   // '{"error":"File not found"}'
  }
}`} />
          </section>

          {/* Archivos */}
          <section id="files" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Archivos</h2>

            <Endpoint
              method="GET"
              path="/files"
              description="Lista tus archivos (paginado)"
              params={[
                { name: "assetId", type: "string", desc: "Filtra por ID de asset" },
                { name: "limit", type: "number", desc: "Máx resultados (default 50, máx 100)" },
                { name: "cursor", type: "string", desc: "Cursor de paginación" },
                { name: "status", type: "string", desc: "Pon 'DELETED' para listar archivos borrados" },
              ]}
              response={`{ "items": [...], "nextCursor": "...", "hasMore": true }`}
              sdk={`const { items, nextCursor, hasMore } = await eb.listFiles({ limit: 10 });`}
            />

            <Endpoint
              method="GET"
              path="/files/:fileId"
              description="Obtén los detalles del archivo con una URL de descarga temporal"
              response={`{ "id": "...", "name": "photo.jpg", "readUrl": "https://..." }`}
              sdk={`const file = await eb.getFile("file_id");
console.log(file.readUrl); // URL prefirmada (1h)`}
            />

            <Endpoint
              method="POST"
              path="/files"
              description="Crea un registro de archivo y obtén una URL de subida prefirmada"
              body={[
                { name: "fileName", type: "string", desc: "Requerido" },
                { name: "contentType", type: "string", desc: "Tipo MIME (requerido)" },
                { name: "size", type: "number", desc: "Tamaño en bytes (requerido, 1B–5GB)" },
                { name: "access", type: "string", desc: "'public' o 'private' (default)" },
                { name: "region", type: "string", desc: "'LATAM', 'US' o 'EU'" },
              ]}
              response={`{ "file": {...}, "putUrl": "https://..." }`}
              note="Sube los bytes con PUT a putUrl, luego haz PATCH del status del archivo a 'DONE'."
              sdk={`const { file, putUrl } = await eb.uploadFile({
  fileName: "photo.jpg",
  contentType: "image/jpeg",
  size: 1024000,
});
await fetch(putUrl, { method: "PUT", body: buffer });
await eb.updateFile(file.id, { status: "DONE" });`}
            />

            <Endpoint
              method="PATCH"
              path="/files/:fileId"
              description="Actualiza nombre, nivel de acceso, metadata o status del archivo"
              body={[
                { name: "name", type: "string", desc: "Nuevo nombre" },
                { name: "access", type: "string", desc: "'public' o 'private'" },
                { name: "metadata", type: "object", desc: "Pares clave-valor (se fusionan, máx 10KB)" },
                { name: "status", type: "string", desc: "Solo 'DONE' (desde PENDING)" },
              ]}
              sdk={`await eb.updateFile("file_id", {
  name: "renamed.jpg",
  access: "public",
  metadata: { tag: "avatar" },
});`}
            />

            <Endpoint
              method="DELETE"
              path="/files/:fileId"
              description="Borrado suave (retención de 7 días)"
              response={`{ "success": true }`}
              sdk={`await eb.deleteFile("file_id");`}
            />

            <Endpoint
              method="POST"
              path="/files/:fileId/restore"
              description="Restaura un archivo borrado (soft-delete)"
              response={`{ "success": true }`}
              sdk={`await eb.restoreFile("file_id");`}
            />

            <Endpoint
              method="GET"
              path="/files/search?q=..."
              description="Búsqueda de archivos en lenguaje natural con IA (requiere AI key)"
              params={[{ name: "q", type: "string", desc: "Consulta en lenguaje natural (requerida)" }]}
              response={`{ "items": [...] }`}
              sdk={`const { items } = await eb.searchFiles("todas las facturas PDF");`}
            />

            <Endpoint
              method="POST"
              path="/files/:fileId/duplicate"
              description="Crea una copia de un archivo existente (nuevo objeto de storage)"
              body={[
                { name: "name", type: "string", desc: "Nombre de la copia (opcional, default 'Copy of ...')" },
              ]}
              response={`{ "id": "...", "name": "Copy of photo.jpg", ... }`}
              sdk={`const copy = await eb.duplicateFile("file_id", "backup.jpg");`}
            />

            <Endpoint
              method="GET"
              path="/files/:fileId/permissions"
              description="Lista los permisos de compartición de un archivo"
              response={`{ "items": [{ "email": "...", "canRead": true, "canWrite": false, ... }] }`}
              sdk={`const { items } = await eb.listPermissions("file_id");`}
            />
          </section>

          {/* Bulk Operations */}
          <section id="bulk" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Operaciones en lote</h2>

            <Endpoint
              method="POST"
              path="/files/bulk-upload"
              description="Crea varios registros de archivo y obtén URLs de subida prefirmadas (máx 20)"
              body={[
                { name: "items", type: "array", desc: "Arreglo de { fileName, contentType, size, access? }" },
              ]}
              response={`{ "items": [{ "file": {...}, "putUrl": "https://..." }, ...] }`}
              note="Cada archivo se sube con PUT a su putUrl, luego se pone el status en DONE."
              sdk={`const { items } = await eb.bulkUploadFiles([
  { fileName: "a.pdf", contentType: "application/pdf", size: 50000 },
  { fileName: "b.png", contentType: "image/png", size: 120000 },
]);
for (const { file, putUrl } of items) {
  await fetch(putUrl, { method: "PUT", body: buffers[file.name] });
  await eb.updateFile(file.id, { status: "DONE" });
}`}
            />

            <Endpoint
              method="POST"
              path="/files/bulk-delete"
              description="Borra varios archivos a la vez (soft-delete, máx 100)"
              body={[
                { name: "fileIds", type: "string[]", desc: "Arreglo de IDs de archivo a borrar" },
              ]}
              response={`{ "deleted": 5, "ids": ["...", "..."] }`}
              sdk={`const result = await eb.bulkDeleteFiles(["id1", "id2", "id3"]);
console.log(result.deleted); // 3`}
            />
          </section>

          {/* Images */}
          <section id="images" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Imágenes</h2>

            <Endpoint
              method="POST"
              path="/files/:fileId/optimize"
              description="Convierte la imagen a WebP o AVIF (crea un archivo nuevo)"
              body={[
                { name: "format", type: "string", desc: "'webp' (default) o 'avif'" },
                { name: "quality", type: "number", desc: "1–100 (default: 80 webp, 50 avif)" },
              ]}
              response={`{ "file": {...}, "originalSize": 1024000, "optimizedSize": 256000, "savings": "75%" }`}
              sdk={`const result = await eb.optimizeImage({
  fileId: "file_id",
  format: "webp",
  quality: 80,
});
console.log(result.savings); // "75%"`}
            />

            <Endpoint
              method="POST"
              path="/files/:fileId/transform"
              description="Redimensiona, recorta, rota, voltea o convierte una imagen (crea un archivo nuevo)"
              body={[
                { name: "width", type: "number", desc: "Ancho objetivo en px" },
                { name: "height", type: "number", desc: "Alto objetivo en px" },
                { name: "fit", type: "string", desc: "'cover', 'contain', 'fill', 'inside', 'outside'" },
                { name: "format", type: "string", desc: "'webp', 'avif', 'png', 'jpeg'" },
                { name: "quality", type: "number", desc: "1–100" },
                { name: "rotate", type: "number", desc: "Grados" },
                { name: "flip", type: "boolean", desc: "Voltea vertical" },
                { name: "grayscale", type: "boolean", desc: "Convierte a escala de grises" },
              ]}
              response={`{ "file": {...}, "originalSize": ..., "transformedSize": ..., "transforms": [...] }`}
              sdk={`const result = await eb.transformImage({
  fileId: "file_id",
  width: 800,
  height: 600,
  fit: "cover",
  format: "webp",
});`}
            />
          </section>

          {/* Sharing */}
          <section id="sharing" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Compartir</h2>

            <Endpoint
              method="POST"
              path="/files/:fileId/share"
              description="Comparte un archivo con otro usuario por email"
              body={[
                { name: "targetEmail", type: "string", desc: "Email del destinatario (requerido)" },
                { name: "canRead", type: "boolean", desc: "Default: true" },
                { name: "canWrite", type: "boolean", desc: "Default: false" },
                { name: "canDelete", type: "boolean", desc: "Default: false" },
              ]}
              sdk={`await eb.shareFile({
  fileId: "file_id",
  targetEmail: "coworker@example.com",
  canWrite: true,
});`}
            />

            <Endpoint
              method="POST"
              path="/files/:fileId/share-token"
              description="Genera una URL de descarga temporal"
              body={[
                { name: "expiresIn", type: "number", desc: "Segundos (60–604800, default 3600)" },
              ]}
              response={`{ "url": "https://...", "token": { "id": "...", "expiresAt": "..." } }`}
              sdk={`const { url } = await eb.generateShareToken("file_id", 3600);
// url es un enlace de descarga prefirmado válido por 1 hora`}
            />

            <Endpoint
              method="GET"
              path="/share-tokens"
              description="Lista los share tokens (paginado)"
              params={[
                { name: "fileId", type: "string", desc: "Filtra por archivo" },
                { name: "limit", type: "number", desc: "Máx resultados" },
                { name: "cursor", type: "string", desc: "Cursor de paginación" },
              ]}
              sdk={`const { items } = await eb.listShareTokens({ fileId: "file_id" });`}
            />
          </section>

          {/* Webhooks */}
          <section id="forms" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Formularios</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Crea formularios de captura <strong>hospedados</strong> — servidos en{" "}
              <code className="bg-gray-100 px-1 rounded">/f/:slug</code>, sin que el usuario final necesite cuenta.
              Cada envío se guarda, dispara el webhook <code className="bg-gray-100 px-1 rounded">form.submitted</code> y
              (si configuraste una) inserta la fila en tu base de datos. Multi-paso por secciones, condicionales y subida de archivos incluidos.
            </p>

            <div className="mb-6 bg-gray-50 border-2 border-gray-300 rounded-xl p-4 text-sm">
              <strong>Tipos de campo:</strong>{" "}
              <code>text</code>, <code>email</code>, <code>tel</code>, <code>textarea</code>, <code>select</code>, <code>date</code>, <code>number</code>, <code>checkbox</code>, <code>radio</code>, <code>file</code>, <code>matrix</code> (cuadrícula filas × columnas).
              {" "}<strong>Templates:</strong> <code>formal</code>, <code>brutalista</code>, <code>institucional</code>, <code>editorial</code>.
            </div>

            <Endpoint
              method="POST"
              path="/forms"
              description="Crea un formulario hospedado standalone. Devuelve la URL pública /f/:slug."
              body={[
                { name: "name", type: "string", desc: "Nombre del formulario (requerido)" },
                { name: "fields", type: "FormField[]", desc: "Campos: { name, type, label, required?, placeholder?, options?, showIf?, accept?, section? }" },
                { name: "theme", type: "string", desc: "Template: formal (default) | brutalista | institucional | editorial" },
                { name: "slug", type: "string", desc: "Slug personalizado (opcional; se deriva del nombre)" },
                { name: "successMessage", type: "string", desc: "Mensaje al enviar (opcional)" },
              ]}
              response={`{ "id": "...", "slug": "contacto", "theme": "formal", "url": "https://www.easybits.cloud/f/contacto" }`}
              sdk={`const form = await eb.createForm({
  name: "Diagnóstico situacional",
  theme: "formal",
  fields: [
    { name: "razon_social", type: "text", label: "Razón social", required: true, section: "Datos generales" },
    { name: "tipo", type: "radio", label: "Tipo de persona moral", options: ["Sociedad mercantil", "Sociedad civil"], section: "Datos generales" },
    { name: "vehiculo", type: "radio", label: "¿Asignó vehículo?", options: ["Sí", "No"], section: "Riesgo" },
    { name: "poliza", type: "text", label: "Número de póliza", showIf: { field: "vehiculo", equals: "Sí" }, section: "Riesgo" },
    { name: "expediente", type: "file", label: "Sube el expediente", accept: ".pdf,image/*", section: "Riesgo" },
  ],
});
console.log(form.url); // https://www.easybits.cloud/f/diagnostico-situacional`}
            />

            <Endpoint
              method="GET"
              path="/forms"
              description="Lista tus formularios con el conteo de respuestas."
              response={`{ "items": [{ "id": "...", "name": "...", "slug": "...", "url": "...", "submissionCount": 12, "createdAt": "..." }] }`}
              sdk={`const { items } = await eb.listForms();`}
            />

            <Endpoint
              method="GET"
              path="/forms/:formId/submissions"
              description="Lista las respuestas de un formulario (más recientes primero)."
              body={[
                { name: "limit", type: "number", desc: "Query param. Máx 200, default 50." },
              ]}
              response={`{ "formName": "...", "items": [{ "id": "...", "data": { "razon_social": "..." }, "createdAt": "..." }], "total": 12 }`}
              sdk={`const { items } = await eb.getFormSubmissions("form_id", { limit: 100 });`}
            />

            <div className="mt-4 bg-purple-50 border-2 border-purple-200 rounded-xl p-4 text-sm text-gray-700">
              Los archivos subidos (<code>type: "file"</code>) se guardan privados; la respuesta almacena el <code>fileId</code>.
              El envío público es <code>POST /forms/:formId/submit</code> (JSON) y la subida <code>POST /forms/:formId/upload</code> (multipart) — ambos sin auth, embebibles en cualquier dominio.
            </div>
          </section>

          <section id="webhooks" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Webhooks</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Recibe notificaciones POST en tiempo real cuando ocurren eventos. Los payloads se firman con HMAC SHA-256 en el header{" "}
              <code className="bg-gray-100 px-1 rounded">X-Easybits-Signature</code>. Los webhooks se pausan solos tras 5 fallos de entrega consecutivos.
            </p>

            <div className="mb-6 bg-gray-50 border-2 border-gray-300 rounded-xl p-4 text-sm">
              <strong>Eventos:</strong>{" "}
              <code>file.created</code>, <code>file.updated</code>, <code>file.deleted</code>, <code>file.restored</code>, <code>website.created</code>, <code>website.deleted</code>, <code>form.submitted</code>, <code>payment.paid</code>, <code>broadcast.sent</code>
            </div>

            <Endpoint
              method="GET"
              path="/webhooks"
              description="Lista tus webhooks configurados"
              response={`{ "items": [{ "id": "...", "url": "https://...", "events": [...], "status": "ACTIVE" }] }`}
              sdk={`const { items } = await eb.listWebhooks();`}
            />

            <Endpoint
              method="POST"
              path="/webhooks"
              description="Crea un webhook. El secret solo se devuelve al crearlo — guárdalo."
              body={[
                { name: "url", type: "string", desc: "URL HTTPS para recibir las notificaciones POST (requerida)" },
                { name: "events", type: "string[]", desc: "Eventos a los que suscribirse (requerido)" },
              ]}
              response={`{ "id": "...", "url": "...", "events": [...], "secret": "whsec_...", "status": "ACTIVE" }`}
              note="Máx 10 webhooks por cuenta. La URL debe usar HTTPS."
              sdk={`const webhook = await eb.createWebhook({
  url: "https://tu-servidor.com/hooks/easybits",
  events: ["file.created", "file.deleted"],
});
console.log(webhook.secret); // guárdalo — se muestra una sola vez`}
            />

            <Endpoint
              method="GET"
              path="/webhooks/:webhookId"
              description="Obtén los detalles del webhook (sin el secret)"
              sdk={`const webhook = await eb.getWebhook("webhook_id");`}
            />

            <Endpoint
              method="PATCH"
              path="/webhooks/:webhookId"
              description="Actualiza URL, eventos o status del webhook"
              body={[
                { name: "url", type: "string", desc: "Nueva URL HTTPS" },
                { name: "events", type: "string[]", desc: "Nueva lista de eventos" },
                { name: "status", type: "string", desc: "'ACTIVE' o 'PAUSED'. Reactivar resetea el contador de fallos." },
              ]}
              sdk={`// Reactivar un webhook pausado
await eb.updateWebhook("webhook_id", { status: "ACTIVE" });`}
            />

            <Endpoint
              method="DELETE"
              path="/webhooks/:webhookId"
              description="Borra un webhook permanentemente"
              response={`{ "success": true }`}
              sdk={`await eb.deleteWebhook("webhook_id");`}
            />

            <h3 className="text-lg font-bold mt-8 mb-4">Verificar firmas</h3>
            <CodeExample
              title="Node.js"
              code={`import { createHmac } from "crypto";

function verifyWebhook(body, signature, secret) {
  const expected = \`sha256=\${createHmac("sha256", secret)
    .update(body).digest("hex")}\`;
  return signature === expected;
}

// En tu handler:
const sig = req.headers["x-easybits-signature"];
const valid = verifyWebhook(rawBody, sig, "whsec_...");`}
            />

            <h3 className="text-lg font-bold mt-8 mb-4">Formato del payload</h3>
            <CodeExample
              title="JSON"
              code={`{
  "event": "file.created",
  "timestamp": "2026-02-26T12:00:00.000Z",
  "data": {
    "id": "abc123",
    "name": "photo.jpg",
    "size": 1024000,
    "contentType": "image/jpeg",
    "access": "private"
  }
}`}
            />
          </section>

          {/* Pagos */}
          <section id="payments" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Pagos</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Genera links de pago con <strong>MercadoPago</strong> (Checkout Pro).
              Conecta tu cuenta en{" "}
              <a href="/dash/developer/payments" className="underline font-medium">
                Dashboard → Pagos
              </a>{" "}
              (pega tu access token). El dinero va <strong>directo a tu cuenta de
              MercadoPago</strong> — EasyBits no retiene fondos. Tools del grupo MCP{" "}
              <code className="bg-gray-100 px-1 rounded">payments</code>.
            </p>

            <div className="mb-6 bg-gray-50 border-2 border-gray-300 rounded-xl p-4 text-sm">
              <strong>Tools MCP:</strong>{" "}
              <code>create_payment_link</code>, <code>list_payment_links</code>. Cuando
              el pago se aprueba, se dispara el webhook <code>payment.paid</code>.
            </div>

            <h3 className="text-lg font-bold mt-6 mb-4">Crear un link de pago</h3>
            <CodeExample
              title="MCP (Claude)"
              code={`// El agente llama la tool create_payment_link
create_payment_link({
  title: "Consultoría 1h",
  amount: 499.00,        // unidades mayores (MXN)
  currency: "MXN"        // opcional, default MXN
})

// → { id, title, amount, currency, initPoint, status: "pending" }
// Comparte el initPoint con tu cliente para que pague.`}
            />

            <h3 className="text-lg font-bold mt-8 mb-4">Webhook payment.paid</h3>
            <CodeExample
              title="JSON"
              code={`{
  "event": "payment.paid",
  "timestamp": "2026-06-19T12:00:00.000Z",
  "data": {
    "id": "paylink_id",
    "title": "Consultoría 1h",
    "amount": 499,
    "currency": "MXN",
    "payerEmail": "cliente@correo.com"
  }
}`}
            />
          </section>

          {/* Email & Broadcasts */}
          <section id="email" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Email & Broadcasts</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Email transaccional, audiencia con tags y newsletters one-shot — todo
              desde MCP. Los broadcasts agregan un pie de <em>cancelar suscripción</em>{" "}
              automáticamente y saltan a los contactos dados de baja. Tools del grupo
              MCP <code className="bg-gray-100 px-1 rounded">email</code>.
            </p>

            <div className="mb-6 bg-gray-50 border-2 border-gray-300 rounded-xl p-4 text-sm">
              <strong>Tools MCP:</strong>{" "}
              <code>send_email</code>, <code>add_contact</code>, <code>list_contacts</code>,{" "}
              <code>create_broadcast</code>, <code>send_broadcast</code>,{" "}
              <code>list_broadcasts</code>. Al terminar un envío se dispara el webhook{" "}
              <code>broadcast.sent</code>.
            </div>

            <h3 className="text-lg font-bold mt-6 mb-4">Email transaccional</h3>
            <CodeExample
              title="MCP (Claude)"
              code={`send_email({
  to: "cliente@correo.com",
  subject: "Tu recibo",
  html: "<h1>Gracias por tu compra</h1>"
})
// → { messageId }`}
            />

            <h3 className="text-lg font-bold mt-8 mb-4">Audiencia + newsletter</h3>
            <CodeExample
              title="MCP (Claude)"
              code={`// 1) Agrega contactos con un tag
add_contact({ email: "ana@correo.com", name: "Ana", tags: ["clientes"] })

// 2) Crea el broadcast (HTML)
create_broadcast({
  subject: "Novedades de junio",
  html: "<h1>Hola 👋</h1><p>Esto es lo nuevo…</p>",
  audienceTag: "clientes"   // omite para enviar a todos los suscritos
})
// → { id, subject, status: "draft" }

// 3) Envíalo
send_broadcast({ broadcastId: "<id>" })
// → { id, status: "sent", total, sent, failed }`}
            />
          </section>

          {/* Websites */}
          <section id="websites" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Sitios web</h2>

            <div className="mb-6 bg-green-50 border-2 border-green-300 rounded-xl p-4 text-sm space-y-2">
              <strong>Cómo funcionan los deploys de sitios:</strong>
              <ol className="list-decimal list-inside space-y-1 text-gray-700">
                <li>Crea un sitio — obtienes un <code className="bg-gray-100 px-1 rounded">id</code> y una URL tipo <code className="bg-gray-100 px-1 rounded">https://my-site.easybits.cloud</code></li>
                <li>Sube archivos con <code className="bg-gray-100 px-1 rounded">fileName</code> puesto en <code className="bg-gray-100 px-1 rounded">{`sites/{websiteId}/path`}</code> (ej. <code className="bg-gray-100 px-1 rounded">{`sites/{id}/index.html`}</code>)</li>
                <li>Haz PUT de los bytes a cada <code className="bg-gray-100 px-1 rounded">putUrl</code>, luego pon el status en DONE</li>
                <li>Tu sitio está en vivo — el fallback SPA a <code className="bg-gray-100 px-1 rounded">index.html</code> viene incluido</li>
              </ol>
            </div>

            <h3 className="text-lg font-bold mb-4">Ejemplo de deploy</h3>
            <CodeExample
              title="SDK"
              code={`// 1. Crear el sitio
const { website } = await eb.createWebsite("my-docs");

// 2. Subir archivos con el prefijo del sitio
const files = [
  { path: "index.html", content: htmlBuffer, type: "text/html" },
  { path: "style.css", content: cssBuffer, type: "text/css" },
  { path: "app.js", content: jsBuffer, type: "application/javascript" },
];

for (const f of files) {
  const { file, putUrl } = await eb.uploadFile({
    fileName: \`sites/\${website.id}/\${f.path}\`,
    contentType: f.type,
    size: f.content.byteLength,
  });
  await fetch(putUrl, { method: "PUT", body: f.content });
  await eb.updateFile(file.id, { status: "DONE" });
}

// 3. En vivo en: https://my-docs.easybits.cloud`}
            />

            <h3 className="text-lg font-bold mt-8 mb-4">Endpoints</h3>

            <Endpoint
              method="GET"
              path="/websites"
              description="Lista tus sitios web estáticos"
              sdk={`const { items } = await eb.listWebsites();`}
            />
            <Endpoint
              method="POST"
              path="/websites"
              description="Crea un sitio nuevo"
              body={[{ name: "name", type: "string", desc: "Nombre del sitio (requerido)" }]}
              response={`{ "website": { "id": "...", "slug": "my-site", "url": "https://my-site.easybits.cloud" } }`}
              sdk={`const { website } = await eb.createWebsite("my-docs");
console.log(website.url); // https://my-docs.easybits.cloud`}
            />
            <Endpoint
              method="GET"
              path="/websites/:websiteId"
              description="Obtén los detalles del sitio"
              sdk={`const site = await eb.getWebsite("website_id");`}
            />
            <Endpoint
              method="PATCH"
              path="/websites/:websiteId"
              description="Actualiza el nombre o status del sitio"
              body={[
                { name: "name", type: "string", desc: "Nuevo nombre" },
                { name: "status", type: "string", desc: "ej. 'DEPLOYED'" },
              ]}
              sdk={`await eb.updateWebsite("website_id", { name: "new-name" });`}
            />
            <Endpoint
              method="DELETE"
              path="/websites/:websiteId"
              description="Borra el sitio y hace soft-delete de todos sus archivos"
              sdk={`await eb.deleteWebsite("website_id");`}
            />
          </section>

          {/* Documentos */}
          <section id="documents" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Documentos</h2>
            <p className="text-gray-600 mb-6 text-sm">
              Documentos profesionales generados con IA (reportes, folletos, catálogos, propuestas, CVs) con generación de páginas en paralelo, direcciones de diseño y temas de color semánticos.
            </p>

            <Endpoint
              method="GET"
              path="/documents"
              description="Lista todos tus documentos"
              response={`{ "items": [{ "id": "doc123", "name": "Q1 Report", "status": "DRAFT", "pageCount": 5 }] }`}
              sdk={`const { items } = await eb.listDocuments();`}
            />

            <Endpoint
              method="GET"
              path="/documents/:id"
              description="Obtén un documento con todos sus datos de páginas/secciones"
              response={`{ "id": "doc123", "name": "Q1 Report", "theme": "minimal", "sections": [...], "pageCount": 5 }`}
              sdk={`const doc = await eb.getDocument("doc123");`}
            />

            <Endpoint
              method="POST"
              path="/documents"
              description="Crea un documento nuevo"
              body={[
                { name: "name", type: "string", desc: "Nombre del documento (requerido)" },
                { name: "prompt", type: "string", desc: "Descripción para la generación con IA" },
                { name: "theme", type: "string", desc: "Tema: minimal, calido, oceano, noche, bosque, rosa" },
                { name: "customColors", type: "object", desc: "Paleta personalizada: { primary, secondary, accent, surface }" },
              ]}
              response={`{ "id": "doc123", "name": "Q1 Report", "status": "DRAFT" }`}
              sdk={`const doc = await eb.createDocument({ name: "Q1 Report", prompt: "Quarterly review" });`}
            />

            <Endpoint
              method="PATCH"
              path="/documents/:id"
              description="Actualiza la metadata del documento (nombre, tema, colores). Usa las tools de página para cambios de contenido."
              body={[
                { name: "name", type: "string", desc: "Nuevo nombre" },
                { name: "prompt", type: "string", desc: "Prompt actualizado" },
                { name: "theme", type: "string", desc: "Nombre del tema" },
                { name: "customColors", type: "object", desc: "Paleta de color personalizada" },
              ]}
              sdk={`await eb.updateDocument("doc123", { theme: "noche" });`}
            />

            <Endpoint
              method="DELETE"
              path="/documents/:id"
              description="Borra un documento"
              sdk={`await eb.deleteDocument("doc123");`}
            />

            <Endpoint
              method="POST"
              path="/documents/:id/deploy"
              description="Publica como sitio en vivo en slug.easybits.cloud"
              response={`{ "url": "https://my-report.easybits.cloud", "websiteId": "...", "slug": "my-report" }`}
              sdk={`const { url } = await eb.deployDocument("doc123");`}
            />

            <Endpoint
              method="POST"
              path="/documents/:id/unpublish"
              description="Quita el sitio en vivo y vuelve a borrador"
              sdk={`await eb.unpublishDocument("doc123");`}
            />

            <h3 className="text-lg font-bold mt-8 mb-4">Gestión de páginas (MCP)</h3>
            <p className="text-gray-600 mb-4 text-sm">
              Estas tools están disponibles vía MCP para edición quirúrgica a nivel de página.
            </p>

            <div className="space-y-4 mb-8">
              <McpTool name="get_page_html" params="documentId, pageId" description="Obtén el HTML y la metadata de una sola página." />
              <McpTool name="set_page_html" params="documentId, pageId, html" description="Actualiza el HTML completo de una página. Preferible a update_document para editar contenido." />
              <McpTool name="get_section_html" params="documentId, pageId, cssSelector" description="Obtén el outerHTML de un elemento específico dentro de una página por selector CSS." />
              <McpTool name="set_section_html" params="documentId, pageId, cssSelector, html" description="Reemplaza un elemento específico dentro de una página. Permite ediciones quirúrgicas." />
              <McpTool name="add_page" params="documentId, html?, afterPageIndex?, label?" description="Agrega una página nueva. Opcionalmente pasa el HTML y la posición de inserción." />
              <McpTool name="delete_page" params="documentId, pageId" description="Elimina una página. No se puede borrar la última que queda." />
              <McpTool name="reorder_pages" params="documentId, pageIds" description="Reordena todas las páginas. pageIds debe contener cada ID de página exactamente una vez." />
              <McpTool name="get_page_screenshot" params="documentId, pageIndex?" description="Toma un screenshot de una página. Devuelve una imagen PNG (tamaño carta). Úsala para verificar las ediciones visualmente." />
            </div>

            <h3 className="text-lg font-bold mt-8 mb-4">Generación con IA (MCP)</h3>
            <div className="space-y-4 mb-8">
              <McpTool name="generate_document" params="documentId, prompt, skipCover?" description="Genera todas las páginas con IA vía streaming. Usa skipCover: true para agregar páginas sin regenerar la portada." />
              <McpTool name="refine_document_section" params="documentId, sectionId, instruction" description="Cambios quirúrgicos con IA a una página específica. Usa get_page_html para ver el resultado." />
              <McpTool name="regenerate_document_page" params="documentId, sectionId" description="Rediseña una página por completo manteniendo la misma intención de contenido." />
              <McpTool name="enhance_document_prompt" params="name, prompt?, action?" description="Auto-genera una descripción desde el título o mejora un prompt existente." />
              <McpTool name="get_document_directions" params="prompt, pageCount?, sourceContent?" description="Obtén 4 direcciones de diseño (fuentes, colores, mood). Pasa una a generate_document." />
              <McpTool name="clone_document" params="documentId, name?" description="Duplica un documento con todas sus páginas." />
            </div>

            <h3 className="text-lg font-bold mt-8 mb-4">Flujo de trabajo</h3>
            <div className="text-sm text-gray-700 space-y-1 mb-4">
              <p>1. <code className="bg-gray-100 px-1 rounded">enhance_document_prompt</code> — auto-genera una descripción</p>
              <p>2. <code className="bg-gray-100 px-1 rounded">get_document_directions</code> — obtén 4 direcciones de diseño</p>
              <p>3. <code className="bg-gray-100 px-1 rounded">create_document</code> — crea el documento</p>
              <p>4. <code className="bg-gray-100 px-1 rounded">generate_document</code> — la IA genera todas las páginas</p>
              <p>5. <code className="bg-gray-100 px-1 rounded">get_page_screenshot</code> — verifica las páginas visualmente</p>
              <p>6. <code className="bg-gray-100 px-1 rounded">refine_document_section</code> — ajusta páginas individuales</p>
              <p>7. <code className="bg-gray-100 px-1 rounded">deploy_document</code> — publica en slug.easybits.cloud</p>
            </div>
          </section>

          {/* Agentes & Sandboxes */}
          <section id="agents" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Agentes & Sandboxes</h2>
            <p className="text-gray-600 mb-4 text-sm">
              MicroVMs Firecracker para correr agentes y código aislado. Crea sandboxes, ejecuta comandos, expón puertos, y despliega agentes persistentes — todo desde el SDK, REST API o herramientas MCP.
            </p>

            <div className="mb-6 bg-green-50 border-2 border-green-300 rounded-xl p-4 text-sm">
              <strong>34 herramientas MCP</strong> en el grupo <code className="bg-gray-100 px-1 rounded">sandbox</code>.{" "}
              Agrega <code className="bg-gray-100 px-1 rounded">--tools sandbox</code> para habilitarlas.{" "}
              <a href="#tool-groups" className="underline">Ver tool groups</a>.
            </div>

            <h3 className="text-lg font-bold mb-3">Templates</h3>
            <p className="text-gray-600 text-sm mb-4">
              Cada sandbox se crea desde un template. Estos son los disponibles:
            </p>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm border-2 border-black rounded-xl overflow-hidden">
                <thead className="bg-black text-white">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs uppercase">Template</th>
                    <th className="text-left px-4 py-2 text-xs uppercase">Tipo</th>
                    <th className="text-left px-4 py-2 text-xs uppercase">Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-200">
                    <td className="px-4 py-2 font-mono text-xs font-bold">code-interpreter</td>
                    <td className="px-4 py-2"><span className="text-xs bg-green-100 px-2 py-0.5 rounded">sandbox</span></td>
                    <td className="px-4 py-2 text-xs text-gray-600">Python con kernel Jupyter persistente. Variables, imports y gráficas sobreviven entre celdas</td>
                  </tr>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs font-bold">python / node / bun</td>
                    <td className="px-4 py-2"><span className="text-xs bg-green-100 px-2 py-0.5 rounded">sandbox</span></td>
                    <td className="px-4 py-2 text-xs text-gray-600">Runtimes base. Cada <code className="bg-gray-100 px-1 rounded">sandbox_run_code</code> ejecuta un proceso fresco</td>
                  </tr>
                  <tr className="border-t border-gray-200">
                    <td className="px-4 py-2 font-mono text-xs font-bold">ubuntu</td>
                    <td className="px-4 py-2"><span className="text-xs bg-green-100 px-2 py-0.5 rounded">sandbox</span></td>
                    <td className="px-4 py-2 text-xs text-gray-600">Linux completo. Ideal para instalar paquetes, compilar, o correr servidores</td>
                  </tr>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs font-bold">rust-ghosty</td>
                    <td className="px-4 py-2"><span className="text-xs bg-purple-100 px-2 py-0.5 rounded">agente</span></td>
                    <td className="px-4 py-2 text-xs text-gray-600">Ghosty: cerebro CodeWhale/Rust DeepSeek-first con canales web SSE y WhatsApp</td>
                  </tr>
                  <tr className="border-t border-gray-200">
                    <td className="px-4 py-2 font-mono text-xs font-bold">claude-code</td>
                    <td className="px-4 py-2"><span className="text-xs bg-purple-100 px-2 py-0.5 rounded">agente</span></td>
                    <td className="px-4 py-2 text-xs text-gray-600">Claude Agent SDK loop. Modelo Sonnet 4.6, billing por token</td>
                  </tr>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs font-bold">computer-ghosty</td>
                    <td className="px-4 py-2"><span className="text-xs bg-purple-100 px-2 py-0.5 rounded">agente</span></td>
                    <td className="px-4 py-2 text-xs text-gray-600">Computer-use con escritorio Linux XFCE + terminal noVNC público</td>
                  </tr>
                  <tr className="border-t border-gray-200">
                    <td className="px-4 py-2 font-mono text-xs font-bold">ghostyclaw / openclaw</td>
                    <td className="px-4 py-2"><span className="text-xs bg-purple-100 px-2 py-0.5 rounded">agente</span></td>
                    <td className="px-4 py-2 text-xs text-gray-600">Daemons always-on para WhatsApp, Slack, Telegram</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-lg font-bold mb-3">Flujo básico: sandbox efímero</h3>
            <p className="text-gray-600 text-sm mb-3">
              Crea un sandbox, ejecuta código, expón un puerto, destrúyelo. Ideal para ejecución aislada.
            </p>
            <TabbedCode
              tabs={[
                { label: "SDK", code: `import { EasybitsClient } from "@easybits.cloud/sdk";
const eb = new EasybitsClient({ apiKey: "eb_sk_live_..." });

// 1. Crear sandbox Python
const sb = await eb.createSandbox({ template: "python", timeoutSeconds: 300 });
console.log(sb.sandboxId);

// 2. Ejecutar código
const { stdout } = await eb.sandboxExec(sb.sandboxId, {
  command: "python3 -c 'print(2+2)'",
});
console.log(stdout); // "4"

// 3. Destruir (libera recursos)
await eb.destroySandbox(sb.sandboxId);` },
                { label: "MCP", code: `# Mismo flujo desde herramientas MCP:
# sandbox_create(template:"python")
# sandbox_exec(sandboxId, command:"python3 -c 'print(2+2)'")
# sandbox_destroy(sandboxId)` },
              ]}
            />

            <h3 className="text-lg font-bold mt-8 mb-3">Snapshot &amp; fork (clonado copy-on-write)</h3>
            <p className="text-gray-600 text-sm mb-3">
              Congela el estado de una caja <strong>viva</strong> en una imagen nombrada (<code className="bg-gray-100 px-1 rounded">snapshot</code>) y arranca <strong>N hijos</strong> desde ella (<code className="bg-gray-100 px-1 rounded">fork</code>). Cada hijo es una caja independiente con su propia IP. Patrón estrella: prepara el entorno una vez (deps instaladas, proyecto listo), snapshotea, y bifurca en paralelo para probar N variantes — sin repetir el setup en cada una.
            </p>
            <div className="mb-4 bg-blue-50 border-2 border-blue-200 rounded-xl p-4 text-sm">
              <strong>El snapshot NO detiene la caja</strong> — sigue corriendo. El fork la clona; los hijos heredan el disco completo al momento del snapshot y cuentan contra tu límite de sandboxes concurrentes.
            </div>
            <TabbedCode
              tabs={[
                { label: "SDK", code: `import { EasybitsClient } from "@easybits.cloud/sdk";
const eb = new EasybitsClient({ apiKey: "eb_sk_live_..." });

// 1. Caja base: instala deps una sola vez
const base = await eb.sandboxes.create({ template: "node" });
await base.exec("npm i -g cowsay");

// 2. Snapshot del estado listo (la caja sigue viva)
const snap = await base.snapshot("deps-listas");

// 3. Fork en 3 hijos que corren en paralelo
const kids = await base.fork({ count: 3 });
for (const k of kids) {
  await k.waitUntilReady();
  const { stdout } = await k.exec("cowsay hola");
  console.log(k.sandboxId, stdout); // cada hijo ya trae cowsay
}

// Reusar el snapshot después, sin la caja base:
const more = await eb.sandboxes.forkFromSnapshot(snap.snapshotId, { count: 2 });

// Catálogo + limpieza
await eb.sandboxes.snapshots.list();
await eb.sandboxes.snapshots.delete(snap.snapshotId);` },
                { label: "MCP", code: `# Congela una caja viva en una imagen nombrada:
# sandbox_snapshot(sandboxId, name:"deps-listas")

# Bifurca en N hijos (snapshotea y forkea en un paso):
# sandbox_fork(sandboxId, count:3)
#   → o desde un snapshot existente:
# sandbox_fork(snapshotId:"snap_...", count:3)

# Catálogo y limpieza:
# list_snapshots()
# delete_snapshot(snapshotId)` },
              ]}
            />

            <h3 className="text-lg font-bold mt-8 mb-3">Exponer un puerto (URL pública)</h3>
            <p className="text-gray-600 text-sm mb-3">
              Arranca un servidor dentro del sandbox y obtén una URL HTTPS pública al instante.
            </p>
            <CodeExample title="SDK" code={`// 1. Crear sandbox ubuntu
const sb = await eb.createSandbox({ template: "ubuntu" });

// 2. Arrancar un server Node en background
await eb.sandboxExecBackground(sb.sandboxId, {
  command: "npx -y serve /app -l 3000",
});

// 3. Exponer el puerto → URL pública
const { url } = await eb.sandboxExposePort(sb.sandboxId, 3000);
console.log(url); // https://sb-abc123-3000.sandboxes.easybits.cloud`} />

            <h3 className="text-lg font-bold mt-8 mb-3">Dominio personalizado (custom domain + HTTPS automático)</h3>
            <p className="text-gray-600 text-sm mb-3">
              Sirve un puerto del sandbox bajo <strong>tu propio dominio</strong> con certificado TLS emitido automáticamente — sin egress fees, sin configurar nada de TLS. Funciona con subdominios (<code className="bg-gray-100 px-1 rounded">app.cliente.com</code>) y dominios raíz (<code className="bg-gray-100 px-1 rounded">cliente.com</code>).
            </p>
            <div className="mb-4 bg-blue-50 border-2 border-blue-200 rounded-xl p-4 text-sm">
              <strong>Flujo (3 pasos):</strong>
              <ol className="list-decimal ml-5 mt-2 space-y-1">
                <li><code className="bg-gray-100 px-1 rounded">sandbox_domain_add</code> → te devuelve en <code className="bg-gray-100 px-1 rounded">dns</code> el registro EXACTO a crear.</li>
                <li>Crea ese registro en tu DNS: <strong>subdominio → CNAME</strong> a <code className="bg-gray-100 px-1 rounded">cname.sandboxes.easybits.cloud</code>; <strong>raíz/apex → A</strong> a la IP del edge (apex no admite CNAME).</li>
                <li><code className="bg-gray-100 px-1 rounded">sandbox_domain_verify</code> → confirma que ya resuelve y sirve con TLS. El cert se emite solo en el primer acceso.</li>
              </ol>
            </div>
            <CodeExample title="SDK" code={`const sb = await eb.sandboxes.create({ template: "ubuntu" });
// ...arranca tu server en el puerto 3000...

// Atar un dominio a ese puerto
const { dns } = await sb.addDomain("app.cliente.com", 3000);
console.log(dns); // { type: "CNAME", name: "app.cliente.com",
                  //   value: "cname.sandboxes.easybits.cloud" }
// (apex como cliente.com devolvería { type: "A", value: "<edge-ip>" })

// Tras crear el registro DNS, confirma que está vivo:
await sb.verifyDomain("app.cliente.com"); // { ready: true, ... }

await sb.listDomains();                    // dominios del sandbox
await sb.removeDomain("app.cliente.com");`} />
            <p className="text-gray-500 text-xs mb-2">
              Nota: crea el registro en tu DNS <strong>autoritativo</strong>. Si tu registrador delega los nameservers a otro proveedor (ej. Google Cloud DNS, Route53), edítalo ahí — no en el panel del registrador.
            </p>

            <h3 className="text-lg font-bold mt-8 mb-3">Kernel persistente (code-interpreter)</h3>
            <p className="text-gray-600 text-sm mb-3">
              El template <code className="bg-gray-100 px-1 rounded">code-interpreter</code> mantiene un kernel Jupyter con estado entre celdas. Variables, imports y gráficas (matplotlib) sobreviven.
            </p>
            <CodeExample title="SDK" code={`const sb = await eb.createSandbox({ template: "code-interpreter" });

// Celda 1: cargar datos
await eb.sandboxRunCell(sb.sandboxId, {
  code: \`import pandas as pd
df = pd.read_csv("ventas.csv")
print(df.head())\`,
});

// Celda 2: usar variable de la celda anterior + gráfica
await eb.sandboxRunCell(sb.sandboxId, {
  code: \`df.groupby("mes")["total"].sum().plot(kind="bar")\`,
});  // ← la gráfica se devuelve como imagen`} />

            <h3 className="text-lg font-bold mt-8 mb-3">Agentes persistentes (agent_create)</h3>
            <p className="text-gray-600 text-sm mb-3">
              Crea agentes de larga duración con un endpoint HTTP público. Ideal para chatbots embebidos, asistentes en WhatsApp, o dashboards.
            </p>
            <CodeExample title="SDK" code={`// Ghosty (DeepSeek-first, web + WhatsApp) — zero config
const ghosty = await eb.createAgent({ template: "rust-ghosty" });
// → { agentId, agentUrl, healthUrl }

// Claude Code managed (Sonnet 4.6, billing por token)
const coder = await eb.createAgent({ template: "claude-code" });

// Enviar mensaje
const { content } = await eb.agentMessage(ghosty.agentId, "Hola!");
console.log(content);`} />

            <h3 className="text-lg font-bold mt-8 mb-3">Agent Run (one-shot)</h3>
            <p className="text-gray-600 text-sm mb-3">
              Dispara un agente Claude para una tarea, espera el resultado, y destruye el sandbox. Ideal para CI/CD, procesamiento por lotes, o tareas puntuales.
            </p>
            <CodeExample title="SDK" code={`const job = await eb.agentRun({
  prompt: "Analiza este CSV y genera un reporte en PDF",
  model: "claude-sonnet-4-6",
  maxTurns: 10,
});

// Poll hasta que termine
let status = await eb.agentRunStatus(job.jobId);
while (status.status === "running") {
  await new Promise(r => setTimeout(r, 5000));
  status = await eb.agentRunStatus(job.jobId);
}
console.log(status.result);  // resultado final del agente`} />

            <h3 className="text-lg font-bold mt-8 mb-3">Herramientas MCP del grupo sandbox</h3>
            <div className="grid md:grid-cols-2 gap-3 mb-6">
              {[
                ["sandbox_create", "template, timeoutSeconds", "Crear un sandbox nuevo"],
                ["sandbox_list", "—", "Listar sandboxes activos"],
                ["sandbox_status", "sandboxId", "Estado del sandbox (running/stopped/error)"],
                ["sandbox_destroy", "sandboxId", "Destruir y liberar recursos"],
                ["sandbox_extend", "sandboxId, extendSeconds", "Extender TTL del sandbox"],
                ["sandbox_suspend", "sandboxId", "Snapshot a disco y liberar CPU (pausa el TTL)"],
                ["sandbox_resume", "sandboxId", "Restaurar desde snapshot (restaura el TTL restante)"],
                ["sandbox_exec", "sandboxId, command", "Ejecutar comando (sync, 60s timeout)"],
                ["sandbox_exec_background", "sandboxId, command", "Ejecutar comando en background"],
                ["sandbox_exec_status", "sandboxId, execId", "Consultar estado de ejecución background"],
                ["sandbox_run_code", "sandboxId, code, lang", "Ejecutar Python/Node/Bash inline"],
                ["sandbox_run_cell", "sandboxId, code", "Ejecutar celda en kernel Jupyter persistente"],
                ["sandbox_files_write", "sandboxId, path, content", "Escribir archivo en el sandbox"],
                ["sandbox_files_read", "sandboxId, path", "Leer archivo del sandbox"],
                ["sandbox_files_list", "sandboxId, path", "Listar directorio"],
                ["sandbox_files_edit", "sandboxId, path, oldString, newString", "Edición quirúrgica in-place (sin escaping de shell)"],
                ["sandbox_logs", "sandboxId, unit?, lines?, since?, grep?", "Logs journald nativos del daemon"],
                ["sandbox_runtime", "sandboxId, action, unit?, buildCommand?", "systemd status/restart/rebuild del daemon"],
                ["sandbox_apply_patch", "sandboxId, edits[], rebuild?, restart?", "Hotfix atómico: edita → rebuild → restart"],
                ["sandbox_expose_port", "sandboxId, port", "Exponer puerto como URL pública HTTPS"],
                ["sandbox_domain_add", "sandboxId, domain, port", "Atar dominio propio (devuelve el registro DNS: CNAME o A)"],
                ["sandbox_domain_remove", "sandboxId, domain", "Quitar dominio personalizado"],
                ["sandbox_domain_list", "sandboxId", "Listar dominios del sandbox"],
                ["sandbox_domain_verify", "domain", "Confirmar DNS + cert TLS del dominio"],
                ["agent_create", "template", "Crear agente persistente (endpoint HTTP)"],
                ["agent_list", "—", "Listar agentes persistentes"],
                ["agent_message", "agentId, content", "Enviar mensaje a un agente"],
                ["agent_run", "prompt, model?", "Agente Claude one-shot (async)"],
                ["agent_run_status", "jobId", "Consultar estado de agent_run"],
                ["templates_list", "tier?", "Listar templates disponibles"],
              ].map(([name, params, desc]) => (
                <McpTool key={name} name={name} params={params} description={desc} />
              ))}
            </div>

            <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4 text-sm">
              <strong>Rate limits:</strong> 10 spawns/min (sandbox_create, agent_create, agent_run). 120 operaciones/min para el resto. Sandboxes se auto-destruyen al TTL (default 5 min; máx según plan: Byte 1h · Mega 4h · Tera 24h).
            </div>
          </section>

          {/* Flota — agentes Ghosty en WhatsApp */}
          <section id="flota" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Flota</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Tu <strong>flota</strong> es un grupo de agentes Ghosty que atienden tus grupos de WhatsApp <strong>24/7</strong>. Respondes a tus clientes al instante, sin contratar a nadie y sin dejar a nadie esperando. Conectas tu WhatsApp una vez y eliges en qué grupos contesta.
            </p>

            <DocScreenshot
              src="/images/flota-ui.png"
              alt="Panel de Flota en el dashboard: capacidad, agentes conectados y grupos de WhatsApp que atiende cada uno"
              caption={<>El panel de Flota en <code className="bg-gray-100 px-1 rounded">/dash/flota</code>: capacidad, agentes conectados y los grupos que atiende cada uno.</>}
            />

            <div className="mb-6 bg-green-50 border-2 border-green-300 rounded-xl p-4 text-sm">
              ¿Prefieres UI? Administra tu flota desde el dashboard en{" "}
              <a href="/dash/flota" className="underline font-medium">/dash/flota</a> — crear agentes, vincular WhatsApp, prender/apagar grupos y desconectar.
            </div>

            <h3 className="text-lg font-bold mb-3">Cómo conectar (WhatsApp personal)</h3>
            <ol className="list-decimal pl-5 text-gray-600 text-sm mb-6 space-y-1.5">
              <li>Entra a <a href="/dash/flota" className="underline font-medium">/dash/flota</a> y crea un agente.</li>
              <li>Vincúlalo a tu WhatsApp: escanea el <strong>código QR</strong> (o usa el código con tu número) desde <em>WhatsApp → Dispositivos vinculados → Vincular dispositivo</em>.</li>
              <li>Prende los grupos que quieras que atienda con los <strong>toggles</strong>. El agente solo responde en los grupos activos — los demás los ignora (anti-spam).</li>
            </ol>

            <h3 className="text-lg font-bold mb-3">WhatsApp Business (WABA)</h3>
            <p className="text-gray-600 text-sm mb-4">
              Conecta tu <strong>WhatsApp Business API</strong> oficial y tu flota atiende desde tu <strong>número oficial</strong>, sin el riesgo de bloqueo de la vinculación personal. WABA atiende <strong>conversaciones 1:1</strong> con tus clientes (no grupos) — ideal para soporte y ventas directas. Cada número tiene su propia identidad (nombre y persona), su propio Inbox y su propio estado de respuesta.
            </p>
            <ol className="list-decimal pl-5 text-gray-600 text-sm mb-4 space-y-1.5">
              <li>En <a href="/dash/flota" className="underline font-medium">/dash/flota</a>, sobre tu agente, pulsa <strong>Conectar WhatsApp Business</strong>. Se abre el wizard de Meta (Embedded Signup) en un popup.</li>
              <li>Sigue los pasos de Meta para vincular tu cuenta de WhatsApp Business. Al terminar, el número queda asociado a ese agente.</li>
              <li>Un número recién conectado arranca <strong>apagado</strong>. Elige su estado de respuesta en <strong>Conversaciones</strong> para que empiece a atender.</li>
            </ol>
            <div className="mb-4 bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-sm">
              <strong>Coexistencia:</strong> puedes conectar el <strong>mismo número</strong> que ya usas en la app de WhatsApp. La coexistencia <strong>siempre está activa</strong>: el agente atiende mientras tú no estás, y en cuanto respondes una conversación desde tu teléfono el bot se <strong>pausa solo</strong> en esa conversación (handoff humano). Desde el Inbox lo <strong>reactivas</strong> o lo <strong>pausas</strong> tú con un botón.
            </div>

            <h3 className="text-lg font-bold mb-3">Inbox y estados de respuesta (por número)</h3>
            <p className="text-gray-600 text-sm mb-3">
              Cada número WABA tiene un <strong>Inbox</strong> (botón <strong>Conversaciones</strong>): ves quién le escribe al agente, su último mensaje, y eliges con granularidad a quién responde. El estado se aplica al instante. Hay <strong>3 estados</strong>:
            </p>
            <ul className="text-gray-600 text-sm mb-4 space-y-2">
              <li><strong>Apagado</strong> — no responde a nadie en ese número.</li>
              <li><strong>Activo</strong> — responde a <strong>todos</strong>, excepto las conversaciones que <strong>pauses</strong> (cuando quieres atenderlas tú). Útil para soporte abierto.</li>
              <li><strong>Solo a…</strong> — responde <strong>solo</strong> a las conversaciones que <strong>actives</strong> (lista blanca). Útil cuando estrenas el bot con un grupo reducido antes de abrirlo a todos.</li>
            </ul>
            <p className="text-gray-600 text-sm mb-6">
              En el Inbox buscas por <strong>nombre o número</strong>, ves quién está <strong>En pausa</strong> y, con un botón, <strong>pausas</strong> o <strong>reactivas</strong> el agente en cada conversación. Cualquier cambio refresca el Inbox de inmediato.
            </p>

            <h3 className="text-lg font-bold mb-3">Cómo funciona: cajas</h3>
            <p className="text-gray-600 text-sm mb-3">
              La capacidad de tu flota se compra en <strong>cajas</strong>. Cada caja corre <strong>{FLEET_BOX.agents} agentes Ghosty</strong> a la vez y cuesta <strong>${FLEET_BOX.priceMxn} MXN/mes</strong> como suscripción mensual. ¿Necesitas atender más conversaciones al mismo tiempo? Agrega más cajas — cada caja suma {FLEET_BOX.agents} agentes a tu flota.
            </p>

            <div className="mb-6 bg-blue-50 border-2 border-blue-300 rounded-xl p-4 text-sm">
              Compra cajas para tu flota en{" "}
              <a href="/dash/packs" className="underline font-medium">/dash/packs</a> — elige cuántas cajas necesitas y se suman a tu capacidad al instante.
            </div>
          </section>

          {/* Sandboxes permanentes (hosting) */}
          <section id="hosting" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Sandboxes permanentes</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Un sandbox efímero se auto-destruye al TTL. Una <strong>sandbox permanente</strong> corre 24/7 y se cobra <strong>flat en MXN/mes</strong> como item de suscripción encima de tu plan. Mismo recurso, mismo <code className="bg-gray-100 px-1 rounded">sandboxId</code> — "permanente" es solo un flag + cobro. La operas igual que cualquier sandbox (exec, archivos, expose_port, dominios).
            </p>

            <div className="mb-6 bg-green-50 border-2 border-green-300 rounded-xl p-4 text-sm">
              <strong>5 herramientas MCP</strong> en el grupo <code className="bg-gray-100 px-1 rounded">hosting</code>.{" "}
              Agrega <code className="bg-gray-100 px-1 rounded">--tools hosting</code> para habilitarlas.{" "}
              Requiere plan de pago (Mega/Tera) — el plan es el gate de acceso.
            </div>

            <div className="mb-6 bg-blue-50 border-2 border-blue-300 rounded-xl p-4 text-sm">
              ¿Prefieres UI? Administra tus sandboxes desde el dashboard en{" "}
              <a href="/dash/hosting" className="underline font-medium">/dash/hosting</a> — crear, ver estado, promover un sandbox a permanente, y liberar.
            </div>

            <h3 className="text-lg font-bold mb-3">Catálogo de tiers</h3>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm border-2 border-black rounded-xl overflow-hidden">
                <thead className="bg-black text-white">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs uppercase">Tier</th>
                    <th className="text-left px-4 py-2 text-xs uppercase">vCPU / RAM / NVMe</th>
                    <th className="text-left px-4 py-2 text-xs uppercase">Shared</th>
                    <th className="text-left px-4 py-2 text-xs uppercase">Reserved</th>
                  </tr>
                </thead>
                <tbody>
                  {SELLABLE_TIERS.map((k, i) => {
                    const t = HOSTING_CATALOG[k];
                    return (
                      <tr key={t.key} className={`border-t border-gray-200 ${i % 2 ? "bg-gray-50" : ""}`}>
                        <td className="px-4 py-2 font-mono text-xs font-bold">{t.key}</td>
                        <td className="px-4 py-2 text-xs text-gray-600">{`${t.vcpus} / ${fmtRam(t.memoryMb)} / ${fmtRam(t.diskMb)}`}</td>
                        <td className="px-4 py-2 text-xs">{fmtPrice(t.priceShared)}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{fmtPrice(t.priceReserved)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-gray-600 text-sm mb-6">
              Precios MXN/mes, NVMe, sin cobro de tráfico. Disco add-on: <strong>+100GB NVMe = $99/mes</strong> (apilable). CPU <strong>reserved</strong> (piso garantizado por cgroup) solo desde <code className="bg-gray-100 px-1 rounded">focus</code>. <code className="bg-gray-100 px-1 rounded">estandar</code> trae disco grande (80GB) para correr una app 24/7 — pensado para migrar desde Fly/Render.
            </p>

            <h3 className="text-lg font-bold mb-3">Crear un sandbox permanente</h3>
            <TabbedCode
              tabs={[
                { label: "SDK", code: `import { EasybitsClient } from "@easybits.cloud/sdk";
const eb = new EasybitsClient({ apiKey: "eb_sk_live_..." });

// Cotiza con el catálogo
const { tiers } = await eb.machines.tiers();

// Crea un sandbox permanente (cobra flat al mes)
const m = await eb.sandboxes.createPermanent({ tier: "focus" });
console.log(m.sandboxId, m.tier, m.monthlyMxn); // operas la VM por sandboxId
await m.exec("apt-get install -y nginx");` },
                { label: "REST", code: `# Catálogo
GET /api/v2/machines/tiers

# Crear permanente
POST /api/v2/machines
{ "tier": "focus", "cpuMode": "shared", "diskAddonsGB": 0 }
# → { sandboxId, tier, monthlyMxn, status, ... }

# Listar / liberar
GET    /api/v2/machines
DELETE /api/v2/machines/:sandboxId` },
                { label: "MCP", code: `list_machine_tiers()                 // catálogo + precios
create_machine({ tier: "focus" })   // crea always-on, cobra flat/mes
list_machines()                     // tus sandboxes + monthlyMxn
release_machine({ sandboxId })      // quita cobro + destruye VM` },
              ]}
            />

            <h3 className="text-lg font-bold mb-3 mt-8">Promover un efímero a permanente</h3>
            <p className="text-gray-600 text-sm mb-3">
              Levanta un sandbox, pruébalo, y si quieres conservarlo hazlo permanente — <strong>conserva el mismo <code className="bg-gray-100 px-1 rounded">sandboxId</code></strong>, desarma el reaper y arranca el cobro.
            </p>
            <TabbedCode
              tabs={[
                { label: "SDK", code: `const sb = await eb.sandboxes.create({ template: "node" }); // efímero
// ...instala, configura, déjalo listo...
await sb.makePermanent("pro"); // ahora always-on, mismo sandboxId
// Para liberar (corta cobro + destruye):
await sb.release();` },
                { label: "REST", code: `# Promover (mismo sandboxId)
POST /api/v2/machines
{ "fromSandboxId": "sb_abc123", "tier": "pro" }` },
                { label: "MCP", code: `make_permanent({ sandboxId: "sb_abc123", tier: "pro" })` },
              ]}
            />

            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 text-sm mt-6">
              <strong>Cobro:</strong> el plan da acceso; cada sandbox factura aparte (flat MXN/mes, prorrateado). <code className="bg-gray-100 px-1 rounded">release_machine</code> es <strong>destructiva</strong> (quita el cobro y destruye la VM). Si tu plan se cancela, tus sandboxes se suspenden.
            </div>
          </section>

          {/* Bases de datos (SQLite-as-a-Service) */}
          <section id="databases" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Bases de datos</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Crea bases de datos <strong>SQLite aisladas</strong> para tus agentes y apps — una por cliente, proyecto o recurso. Corren sobre <code className="bg-gray-100 px-1 rounded">sqld</code> (libsql-server), con scale-to-zero: no pagas cómputo cuando nadie consulta. Cada DB es un namespace independiente; tu agente las crea, consulta y llena sin que escribas backend.
            </p>

            <div className="mb-6 bg-blue-50 border-2 border-blue-300 rounded-xl p-4 text-sm">
              Límite por plan: <strong>Byte 3 · Mega 10 · Tera 20</strong> bases de datos. El nombre admite letras, números, guiones y guiones bajos (máx 64 caracteres).
            </div>

            <h3 className="text-lg font-bold mb-3">Crear y consultar</h3>
            <TabbedCode
              tabs={[
                { label: "SDK", code: `import { EasybitsClient } from "@easybits.cloud/sdk";
const eb = new EasybitsClient({ apiKey: "eb_sk_live_..." });

// Crea una base de datos
const db = await eb.createDatabase({ name: "leads", description: "Prospectos del sitio" });

// Inserta y consulta
await eb.db("leads").query(
  "CREATE TABLE IF NOT EXISTS contactos (id INTEGER PRIMARY KEY, nombre TEXT, email TEXT)"
);
await eb.db("leads").query(
  "INSERT INTO contactos (nombre, email) VALUES (?, ?)",
  ["Ana", "ana@correo.com"]
);
const { rows } = await eb.db("leads").query("SELECT * FROM contactos");` },
                { label: "REST", code: `# Crear
POST /api/v2/databases
{ "name": "leads", "description": "Prospectos del sitio" }

# Consultar
POST /api/v2/databases/:dbId/query
{ "sql": "SELECT * FROM contactos WHERE email = ?", "args": ["ana@correo.com"] }
# → { cols, rows, affected_row_count, last_insert_rowid }` },
                { label: "MCP", code: `db_create({ name: "leads", description: "Prospectos del sitio" })
db_query({ dbId: "db_abc", sql: "SELECT * FROM contactos" })
db_exec({ dbId: "db_abc", statements: [{ sql: "..." }] })   // batch (máx 20)
db_import({ dbId: "db_abc", table: "contactos", columns: ["nombre","email"], rows: [["Ana","ana@correo.com"]] })  // hasta 10,000 filas` },
              ]}
            />

            <h3 className="text-lg font-bold mt-8 mb-3">Herramientas MCP del grupo <code className="bg-gray-100 px-1 rounded">databases</code></h3>
            <div className="space-y-2 mb-6">
              {[
                ["db_list", "—", "Listar tus bases de datos"],
                ["db_create", "name, description?", "Crear una base de datos aislada"],
                ["db_get", "dbId", "Obtener una base de datos"],
                ["db_delete", "dbId", "Eliminar la base de datos y todos sus datos (irreversible)"],
                ["db_query", "dbId, sql, args?", "Ejecutar una consulta SQL"],
                ["db_exec", "dbId, statements", "Batch de hasta 20 sentencias"],
                ["db_import", "dbId, table, columns, rows, onConflict?", "Importar hasta 10,000 filas de una vez"],
              ].map(([name, params, desc]) => (
                <McpTool key={name} name={name} params={params} description={desc} />
              ))}
            </div>

            <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 text-sm">
              Eventos de webhook: <code className="bg-gray-100 px-1 rounded">database.created</code> y <code className="bg-gray-100 px-1 rounded">database.deleted</code>. Combínalos con la sección <a href="#webhooks" className="underline font-medium">Webhooks</a> para notificar sistemas externos.
            </div>
          </section>

          {/* Secretos */}
          <section id="secrets" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Secretos</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Guarda credenciales (API tokens, OAuth, llaves) <strong>cifradas AES-256-GCM</strong> en tu cuenta. Un secreto es <strong>write-only</strong>: una vez guardado, su valor <strong>nunca</strong> se puede volver a leer por API ni MCP — solo se <strong>inyecta como variable de entorno</strong> dentro de un sandbox vía <code className="bg-gray-100 px-1 rounded">agent_run(&#123; secrets: [nombre, ...] &#125;)</code>. Es también donde vive el OAuth que usa tu <a href="#flota" className="underline font-medium">Flota</a>.
            </p>

            <div className="mb-6 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 text-sm">
              Solo disponible vía <strong>MCP</strong> (no hay endpoint REST ni método SDK, por seguridad). Los nombres deben ser estilo variable de entorno: <code className="bg-gray-100 px-1 rounded">[A-Z_][A-Z0-9_]*</code> (mayúsculas, dígitos y guiones bajos).
            </div>

            <h3 className="text-lg font-bold mb-3">Herramientas MCP del grupo <code className="bg-gray-100 px-1 rounded">secrets</code></h3>
            <div className="space-y-2 mb-6">
              {[
                ["secret_set", "name, value", "Crear o sobrescribir un secreto (cifrado; el valor no se devuelve jamás)"],
                ["secret_list", "—", "Listar nombres, fecha de creación y último uso (nunca valores)"],
                ["secret_delete", "name", "Eliminar un secreto por nombre"],
              ].map(([name, params, desc]) => (
                <McpTool key={name} name={name} params={params} description={desc} />
              ))}
            </div>

            <CodeExample
              title="MCP"
              code={`secret_set({ name: "BRIGHTDATA_API_TOKEN", value: "bd_..." })
secret_list()   // → [{ name, createdAt, lastUsedAt }]  (sin valores)

// Inyectar en un sandbox al correr un agente:
agent_run({ prompt: "scrapea ...", secrets: ["BRIGHTDATA_API_TOKEN"] })`}
            />
          </section>

          {/* Llamadas */}
          <section id="calls" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Llamadas</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Salas de videollamada con <strong>grabación en HD</strong>, self-hosted (template <code className="bg-gray-100 px-1 rounded">livekit-svc</code>). Tu agente crea la sala, los participantes se unen <strong>desde el navegador</strong> (cámara + pantalla compartida, sin instalar nada), y el servidor graba el layout completo en 1080p. Al terminar, el MP4 se sube a tus <a href="#files" className="underline font-medium">Archivos</a>. Sin servidores de terceros, sin límite de duración.
            </p>

            <div className="mb-6 bg-green-50 border-2 border-green-300 rounded-xl p-4 text-sm">
              <strong>6 herramientas MCP</strong> en el grupo <code className="bg-gray-100 px-1 rounded">sandbox</code>:{" "}
              <code className="bg-gray-100 px-1 rounded">call_create</code>, <code className="bg-gray-100 px-1 rounded">call_record</code>, <code className="bg-gray-100 px-1 rounded">call_stop</code>, <code className="bg-gray-100 px-1 rounded">call_status</code>, <code className="bg-gray-100 px-1 rounded">call_files</code>, <code className="bg-gray-100 px-1 rounded">call_destroy</code>.{" "}
              Las llaves del servidor de video se <strong>generan solas</strong> — no necesitas cuenta en ningún proveedor ni pasar secrets.
            </div>

            <h3 className="text-lg font-bold mb-3">Crear una llamada y grabar</h3>
            <p className="text-gray-600 text-sm mb-3">
              <code className="bg-gray-100 px-1 rounded">create</code> levanta la sala y devuelve <code className="bg-gray-100 px-1 rounded">roomUrl</code> — compártelo con los participantes. La sala se auto-destruye a las <strong>3 horas</strong> si no la cierras antes.
            </p>
            <TabbedCode
              tabs={[
                { label: "SDK", code: `import { EasybitsClient } from "@easybits.cloud/sdk";
const eb = new EasybitsClient({ apiKey: "eb_sk_live_..." });

// 1. Crear la sala (devuelve el link para compartir)
const call = await eb.calls.create({ room: "entrevista" });
console.log(call.roomUrl); // https://...sandboxes.easybits.cloud/room?room=entrevista

// 2. Iniciar grabación server-side
await eb.calls.record(call.sandboxId, { room: call.room });

// 3. Detener — sube el MP4 a Archivos y devuelve el link
const { url, fileId } = await eb.calls.stop(call.sandboxId);` },
                { label: "REST", code: `# 1. Crear la sala
POST /api/v2/calls                 { "room": "entrevista" }
# → { sandboxId, room, roomUrl }

# 2. Grabar
POST /api/v2/calls/:id/record      { "room": "entrevista" }
# → { recording: true }

# 3. Detener (sube el MP4 a Archivos)
POST /api/v2/calls/:id/stop
# → { url, fileId }` },
                { label: "MCP", code: `call_create({ room: "entrevista" })   // → { sandboxId, room, roomUrl }
call_record({ sandboxId, room })      // inicia grabación HD
call_stop({ sandboxId })              // → { url, fileId } (MP4 en Archivos)` },
              ]}
            />

            <h3 className="text-lg font-bold mb-3 mt-8">Estado, archivos y cierre</h3>
            <p className="text-gray-600 text-sm mb-3">
              <code className="bg-gray-100 px-1 rounded">status</code> reporta si está grabando y quién está conectado; <code className="bg-gray-100 px-1 rounded">files</code> lista las grabaciones; <code className="bg-gray-100 px-1 rounded">destroy</code> cierra la sala limpiamente (sube grabaciones pendientes y libera la VM).
            </p>
            <TabbedCode
              tabs={[
                { label: "SDK", code: `// Estado en vivo de la sala
const st = await eb.calls.status(call.sandboxId);
// → { recording, room, startedAt, participants: ["Ana", "Beto"] }

// Listar las grabaciones (en tus Archivos, source: "studio")
const recs = await eb.calls.files();
// → [{ id, name, url, source, createdAt }]

// Cerrar la llamada (sube lo pendiente + destruye la VM)
await eb.calls.destroy(call.sandboxId);` },
                { label: "REST", code: `# Estado en vivo
GET  /api/v2/calls/:id/status
# → { recording, room, startedAt, participants[] }

# Grabaciones (en Archivos)
GET  /api/v2/calls/files
# → [{ id, name, url, source, createdAt }]

# Cerrar (sube pendientes + destruye)
POST /api/v2/calls/:id/destroy` },
                { label: "MCP", code: `call_status({ sandboxId })    // ¿grabando? ¿quién está conectado?
call_files()                  // lista las grabaciones en Archivos
call_destroy({ sandboxId })   // cierra la sala y libera la VM` },
              ]}
            />

            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 text-sm mt-6">
              <strong>Privacidad:</strong> cada sala corre en su propia microVM aislada con llaves generadas por instancia. Los participantes eligen entrar con cámara/mic apagados (el dispositivo se suelta de verdad, sin parpadeo). Si no llamas <code className="bg-gray-100 px-1 rounded">call_destroy</code>, la sala se apaga sola al TTL de 3 horas.
            </div>
          </section>

          {/* Account & Usage */}
          <section id="account" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Cuenta & Uso</h2>

            <Endpoint
              method="GET"
              path="/usage"
              description="Obtén las estadísticas de uso de la cuenta: storage, conteo de archivos, info del plan"
              response={`{ "plan": "Byte", "storage": { "usedGB": 0.05, "maxGB": 0.1, "percentUsed": 50 }, "counts": { "files": 42, "webhooks": 2 } }`}
              sdk={`const stats = await eb.getUsageStats();
console.log(\`\${stats.storage.usedGB}/\${stats.storage.maxGB} GB\`);`}
            />

            <Endpoint
              method="GET"
              path="/providers"
              description="Lista tus proveedores de storage configurados"
              response={`{ "providers": [...], "defaultProvider": { "type": "TIGRIS" } }`}
              sdk={`const { providers } = await eb.listProviders();`}
            />

            <Endpoint
              method="GET"
              path="/keys"
              description="Lista tus API keys (solo con auth de sesión)"
              sdk={`const { keys } = await eb.listKeys();`}
            />
          </section>

          {/* Errors */}
          <section id="errors" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Errores & Límites</h2>
            <div className="space-y-4 text-sm">
              <div className="border-2 border-black rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-100 border-b-2 border-black">
                    <tr>
                      <th className="px-4 py-2 font-bold">Status</th>
                      <th className="px-4 py-2 font-bold">Significado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr><td className="px-4 py-2 font-mono">400</td><td className="px-4 py-2">Petición inválida (params incorrectos)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">401</td><td className="px-4 py-2">No autorizado (API key faltante/inválida)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">403</td><td className="px-4 py-2">Prohibido (scope insuficiente)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">404</td><td className="px-4 py-2">Recurso no encontrado</td></tr>
                    <tr><td className="px-4 py-2 font-mono">429</td><td className="px-4 py-2">Rate limited (demasiadas peticiones)</td></tr>
                    <tr><td className="px-4 py-2 font-mono">500</td><td className="px-4 py-2">Error del servidor</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="text-gray-600">
                Todas las respuestas de error tienen la misma forma: un JSON <code className="bg-gray-100 px-1 rounded">{`{ "error": "message" }`}</code>, opcionalmente con campos extra (ej. <code className="bg-gray-100 px-1 rounded">code</code>, <code className="bg-gray-100 px-1 rounded">status</code>). Por MCP se devuelve el mismo payload con <code className="bg-gray-100 px-1 rounded">isError: true</code>.
              </p>
              <p className="text-gray-600">
                Todo endpoint de lista devuelve el mismo envelope: <code className="bg-gray-100 px-1 rounded">{`{ items, nextCursor, hasMore, total? }`}</code>. Cuando <code className="bg-gray-100 px-1 rounded">hasMore</code> es true, regresa <code className="bg-gray-100 px-1 rounded">nextCursor</code> como <code className="bg-gray-100 px-1 rounded">cursor</code> (u <code className="bg-gray-100 px-1 rounded">offset</code> para documentos/sitios) para traer la siguiente página.
              </p>
              <p className="text-gray-600">
                Límites: 100 peticiones cada 15 minutos en todos los planes.
              </p>
            </div>
          </section>

          {/* Tool Groups */}
          <section id="tool-groups" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Tool Groups</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Por defecto el servidor MCP carga <strong>12 herramientas core</strong> para minimizar el uso de tokens.
              Habilita grupos adicionales para desbloquear más capacidades.
            </p>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm border-2 border-black rounded-xl overflow-hidden">
                <thead className="bg-black text-white">
                  <tr>
                    <th className="text-left px-4 py-2">Grupo</th>
                    <th className="text-left px-4 py-2">Herramientas</th>
                    <th className="text-left px-4 py-2">Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["core", "12", "Archivos, DB, documentos, cotizaciones, estadísticas (default)"],
                    ["sandbox", "22", "MicroVMs Firecracker: crear, ejecutar, exponer puertos, agentes persistentes y one-shot"],
                    ["files", "~37", "Todas las ops de archivos: bulk, sharing, permisos, webhooks, imágenes, AI keys"],
                    ["docs", "~33", "Documentos: generación AI, refine, screenshots, structured docs"],
                    ["sites", "~8", "Sitios web: CRUD, upload, deploy"],
                    ["brand", "~8", "Brand kits, plantillas, temas"],
                    ["payments", "2", "Links de pago con MercadoPago (BYO): create_payment_link, list_payment_links"],
                    ["email", "6", "Email transaccional + contactos + broadcasts (send_email, add_contact, create_broadcast…)"],
                    ["all", "~104", "Todo (incluye slides y agentes)"],
                  ].map(([group, count, desc]) => (
                    <tr key={group} className="border-t border-gray-200">
                      <td className="px-4 py-2 font-mono font-bold">{group}</td>
                      <td className="px-4 py-2">{count}</td>
                      <td className="px-4 py-2 text-gray-600">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="text-lg font-bold mb-3">Uso</h3>
            <TabbedCode
              tabs={[
                { label: "Ghosty Code", code: `# Ghosty Code — MCP de EasyBits preconfigurado.
npm install -g ghostycode
ghosty auth set --provider easybits --api-key "TU_EASYBITS_API_KEY"
ghosty --yolo` },
                { label: "Claude Code", code: `# Core + sandboxes + documents
claude mcp add easybits -- npx -y @easybits.cloud/mcp --key YOUR_KEY --tools sandbox,docs

# Todo
claude mcp add easybits -- npx -y @easybits.cloud/mcp --key YOUR_KEY --tools all` },
                { label: "Streamable HTTP", code: `// Agrega ?tools= a la URL
https://www.easybits.cloud/api/mcp?tools=sandbox,docs
https://www.easybits.cloud/api/mcp?tools=all` },
              ]}
            />
          </section>

        </main>
      </div>
    </section>
  );
}

// ─── Components ──────────────────────────────────────────────────

const LANG_MAP: Record<string, string> = {
  curl: "bash",
  sdk: "typescript",
  header: "http",
  "node.js": "javascript",
  json: "json",
  install: "bash",
};

// Captura de UI SSR-safe: el <figure> arranca OCULTO y solo se revela cuando la
// imagen carga de verdad (onLoad o, si ya estaba completa al hidratar, el effect).
// Si el PNG falta (404) nunca se revela → cero imagen rota en prod. onError aquí
// es insuficiente solo porque el evento puede dispararse antes de hidratar.
function DocScreenshot({ src, alt, caption }: { src: string; alt: string; caption: React.ReactNode }) {
  const ref = useRef<HTMLImageElement>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth > 0) setOk(true);
  }, []);
  return (
    <figure className="mb-6" style={{ display: ok ? undefined : "none" }}>
      <img
        ref={ref}
        src={src}
        alt={alt}
        onLoad={() => setOk(true)}
        onError={() => setOk(false)}
        className="w-full rounded-xl border-2 border-black"
      />
      <figcaption className="text-xs text-gray-500 mt-2 text-center">{caption}</figcaption>
    </figure>
  );
}

function TabbedCode({ tabs }: { tabs: { label: string; code: string }[] }) {
  const [active, setActive] = useState(0);
  return (
    <div className="border-2 border-black rounded-xl overflow-hidden">
      <div className="flex bg-gray-800">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setActive(i)}
            className={`px-4 py-1.5 text-xs font-bold uppercase transition-colors ${
              active === i
                ? "bg-gray-950 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <CodeBlock bare language={LANG_MAP[tabs[active].label.toLowerCase()] || "typescript"}>
        {tabs[active].code}
      </CodeBlock>
    </div>
  );
}

function CodeExample({ title, code }: { title: string; code: string }) {
  const lang = LANG_MAP[title.toLowerCase()] || "typescript";
  return (
    <div className="border-2 border-black rounded-xl overflow-hidden">
      <div className="flex items-center justify-between bg-gray-800 px-4 py-2">
        <span className="text-white font-medium text-sm">{title}</span>
        <span className="text-gray-400 text-xs uppercase font-mono">{lang}</span>
      </div>
      <CodeBlock bare language={lang}>
        {code}
      </CodeBlock>
    </div>
  );
}

interface ParamDef {
  name: string;
  type: string;
  desc: string;
}

function Endpoint({
  method,
  path,
  description,
  params,
  body,
  response,
  note,
  sdk,
}: {
  method: string;
  path: string;
  description: string;
  params?: ParamDef[];
  body?: ParamDef[];
  response?: string;
  note?: string;
  sdk?: string;
}) {
  const methodColors: Record<string, string> = {
    GET: "bg-green-200 text-green-900",
    POST: "bg-blue-200 text-blue-900",
    PATCH: "bg-yellow-200 text-yellow-900",
    DELETE: "bg-red-200 text-red-900",
  };

  return (
    <div className="mb-8 border-2 border-black rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${methodColors[method] || "bg-gray-200"}`}>
          {method}
        </span>
        <code className="font-mono text-sm font-bold">{path}</code>
      </div>
      <div className="p-4">
        <p className="text-gray-700 text-sm mb-3">{description}</p>
        {params && <ParamTable title="Query Parameters" items={params} />}
        {body && <ParamTable title="Request Body (JSON)" items={body} />}
        {response && (
          <div className="mt-3">
            <span className="text-xs font-bold text-gray-500 uppercase">Response</span>
            <div className="mt-1 rounded-lg overflow-hidden">
              <CodeBlock bare language="json">{response}</CodeBlock>
            </div>
          </div>
        )}
        {sdk && (
          <div className="mt-3">
            <span className="text-xs font-bold text-purple-600 uppercase">SDK</span>
            <div className="mt-1 rounded-lg overflow-hidden">
              <CodeBlock bare language="typescript">{sdk}</CodeBlock>
            </div>
          </div>
        )}
        {note && (
          <p className="mt-3 text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded-lg p-2">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

function ParamTable({ title, items }: { title: string; items: ParamDef[] }) {
  return (
    <div className="mt-3">
      <span className="text-xs font-bold text-gray-500 uppercase">{title}</span>
      <table className="w-full mt-1 text-sm">
        <tbody className="divide-y divide-gray-100">
          {items.map((p) => (
            <tr key={p.name}>
              <td className="py-1 pr-4 font-mono text-xs font-bold w-32">{p.name}</td>
              <td className="py-1 pr-4 text-gray-500 text-xs w-20">{p.type}</td>
              <td className="py-1 text-gray-600 text-xs">{p.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function McpTool({ name, params, description }: { name: string; params: string; description: string }) {
  return (
    <div className="border-2 border-black rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <code className="font-mono text-sm font-bold">{name}</code>
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded border border-indigo-300">MCP</span>
      </div>
      <p className="text-xs text-gray-500 font-mono mb-2">{params}</p>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}

function SdkMethodTable({ title, methods }: { title: string; methods: [string, string][] }) {
  return (
    <div className="mb-6">
      <h4 className="text-sm font-bold text-gray-700 mb-2">{title}</h4>
      <div className="border-2 border-black rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 font-bold text-xs uppercase text-gray-500">Method</th>
              <th className="text-left px-4 py-2 font-bold text-xs uppercase text-gray-500">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {methods.map(([method, desc]) => (
              <tr key={method}>
                <td className="px-4 py-1.5 font-mono text-xs text-purple-700 font-medium">{method}</td>
                <td className="px-4 py-1.5 text-xs text-gray-600">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}