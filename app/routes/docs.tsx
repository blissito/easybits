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
    title: "EasyBits API Docs — La nube para expertos IA",
    description: "Referencia completa de EasyBits: REST API v2, SDK y MCP con más de 200 tools para agentes — sandboxes, web, archivos, bases de datos, documentos, hosting y WhatsApp.",
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
  { id: "web", label: "Web" },
  { id: "sharing", label: "Compartir" },
  { id: "forms", label: "Formularios" },
  { id: "webhooks", label: "Webhooks" },
  { id: "payments", label: "Pagos" },
  { id: "email", label: "Email & Broadcasts" },
  { id: "websites", label: "Sitios web" },
  { id: "documents", label: "Documentos" },
  { id: "video-projects", label: "Video" },
  { id: "agents", label: "Agentes & Sandboxes" },
  { id: "ghosty-lite", label: "Ghosty Lite" },
  { id: "flota", label: "Flota" },
  { id: "agentes-en-tu-app", label: "Agentes en tu app" },
  { id: "hosting", label: "Sandboxes permanentes" },
  { id: "databases", label: "Bases de datos" },
  { id: "secrets", label: "Secretos" },
  { id: "llm", label: "LLM (OpenAI-compatible)" },
  { id: "calls", label: "Llamadas" },
  { id: "account", label: "Cuenta & Uso" },
  { id: "errors", label: "Errores & Límites" },
  { id: "tool-groups", label: "Tool Groups" },
] as const;

// Sections that show the "Nuevo" badge in the nav (recently shipped).
const NEW_SECTIONS = new Set<string>(["agentes-en-tu-app", "ghosty-lite", "flota", "video-projects", "calls", "secrets", "images", "web"]);

export default function DocsPage() {
  const location = useLocation();

  // Estado inicial DETERMINISTA (igual en server y cliente) para no causar un
  // hydration mismatch: leer location.hash aquí daba "quickstart" en SSR y la
  // sección real en cliente → React dejaba el <a> de "Inicio rápido" con su
  // clase activa huérfana (DOS ítems negros en dev). El hash lo aplica el
  // useEffect([location.hash]) de abajo, ya en cliente.
  const [activeSection, setActiveSection] = useState("quickstart");

  // Entrar por #ancla NO es un scroll y ya: el resaltado de código (CodeBlock
  // es async), las fuentes y las imágenes cambian la altura de lo que queda
  // ARRIBA del destino DESPUÉS de haber saltado, así que un scrollIntoView
  // único aterriza en una sección anterior — el link se ve roto aunque la
  // sección exista. Se re-ancla cada frame hasta que la posición se estabiliza
  // (o hasta el tope de tiempo), y se abandona en cuanto el usuario toma el
  // control del scroll.
  useEffect(() => {
    const hash = location.hash.replace("#", "");
    if (!hash || !SECTIONS.some((s) => s.id === hash)) return;
    setActiveSection(hash);

    const TOP = 80; // hueco sobre el título, igual que la línea del scrollspy
    // Tope generoso a propósito: esta página mide ~70.000px y el resaltado de
    // código sigue creciendo varios segundos. Con 2.5s el ancla se soltaba a
    // media persecución y el lector aterrizaba 40.000px arriba de su sección.
    const DEADLINE = 10_000;
    const started = performance.now();
    let raf = 0, stable = 0, done = false, lastH = 0;

    const stop = () => {
      done = true;
      cancelAnimationFrame(raf);
      for (const ev of ["wheel", "touchstart", "keydown"]) {
        window.removeEventListener(ev, stop);
      }
    };
    for (const ev of ["wheel", "touchstart", "keydown"]) {
      window.addEventListener(ev, stop, { passive: true, once: true });
    }

    const tick = () => {
      if (done) return;
      const el = document.getElementById(hash);
      if (el) {
        const delta = el.getBoundingClientRect().top - TOP;
        // La altura del documento es el testigo de que el layout dejó de
        // moverse: mientras cambie, algo sigue cargando ARRIBA del destino y
        // hay que volver a anclarse aunque este frame ya estuviera en su sitio.
        const h = document.documentElement.scrollHeight;
        const settled = h === lastH;
        lastH = h;
        // Salto instantáneo, no `smooth`: una animación en curso pelea con la
        // corrección del siguiente frame y el destino nunca se alcanza.
        if (Math.abs(delta) > 2) {
          window.scrollBy({ top: delta, behavior: "auto" });
          stable = 0;
        } else if (settled && ++stable >= 10) {
          return stop(); // en su sitio y con el layout quieto: soltamos el ancla
        }
      }
      if (performance.now() - started > DEADLINE) return stop();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return stop;
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
                description: "REST API v2 de EasyBits, la nube para expertos IA: sandboxes, web (buscar, leer, extraer), archivos, bases de datos, documentos, hosting y agentes en WhatsApp.",
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
                description: "MCP server with 200+ tools for AI agents: sandboxes, web search/fetch/extract, files, databases, documents, hosting and WhatsApp agents. Works with Claude, Cursor and any MCP-compatible client.",
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
        <aside className="hidden md:block w-56 shrink-0 border-r-2 border-black sticky top-[57px] self-start p-4 max-h-[calc(100vh-57px)] overflow-y-auto">
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
                {NEW_SECTIONS.has(s.id) && (
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
                { label: "ghosty mcp", code: `# El toolset va en el path. Autorizas en el navegador, sin key.
ghosty mcp add easybits --url "https://www.easybits.cloud/api/mcp/all"
ghosty mcp login easybits
ghosty mcp list

# 4. Listo
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
              <li>Paste the MCP URL: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">https://www.easybits.cloud/api/mcp</code> (or pick a toolset: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">/api/mcp/sandbox</code>)</li>
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
                    ["/.well-known/oauth-protected-resource[/<resource path>]", "RFC 9728", "Tells clients which Authorization Server protects /api/mcp. Ask for the toolset path (e.g. /api/mcp/sandbox) and it answers for that exact resource"],
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
              ["getForm(formId)", "Obtén la config del formulario (campos, theme)"],
              ["updateForm(formId, patch)", "Actualiza nombre, theme, campos o mensaje"],
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
              method="GET"
              path="/stock-photos"
              description="Busca una foto libre de regalías en bancos gratuitos (Pexels → Unsplash → Pixabay → Openverse) y devuelve la primera coincidencia"
              params={[
                { name: "q", type: "string", desc: "Qué buscar (requerido). En inglés da mejores resultados en todos los bancos" },
                { name: "save", type: "boolean", desc: "Guarda la foto en tu biblioteca y añade fileId + savedUrl. Requiere scope WRITE; buscar sin guardar, no" },
              ]}
              response={`{ "url": "...", "alt": "...", "photographer": "...", "provider": "pexels", "sourceUrl": "...", "attribution": "Foto de ... en ... (...)" }`}
              note="Cuesta 1 crédito por llamada, también cuando la coincidencia es mala: la búsqueda es difusa y casi siempre devuelve algo, así que revisa `alt` para juzgar la relevancia en vez de esperar un error. Debes mostrar `attribution`: Unsplash y Pixabay exigen acreditar al autor en sus términos."
              sdk={`const photo = await eb.searchStockPhoto({
  query: "coffee shop interior",
  save: true,
});

console.log(photo.url);
console.log(photo.attribution); // acredita al autor`}
            />

            <McpTool
              name="search_stock_photo"
              params="query, save?"
              description="Busca una foto de stock libre de regalías y devuelve su URL. Con save guarda una copia en la biblioteca. Cuesta 1 crédito; muestra siempre attribution."
            />
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
          <section id="web" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Web</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Internet para tus agentes: buscar en Google, leer cualquier página aunque bloquee bots (IPs residenciales, JS resuelto),
              extraer registros con esquema de sitios conocidos y rastrear un sitio completo. Disponible por REST, SDK y MCP (toolset <code className="bg-gray-100 px-1 rounded">web</code>).
            </p>
            <div className="mb-6 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 text-sm">
              <strong>Se mide en consultas, no en créditos.</strong> 1 consulta = 1 página leída, 1 búsqueda, 1 registro extraído — y en un rastreo, cada página que lee (máx. 20 por llamada).
              Tienes 50 al registrarte; los packs Web ($99 → 400, $999 → 10,000) están en <a href="/dash/packs?tab=web" className="underline font-bold">/dash/packs?tab=web</a>, valen para cualquier plan y <b>no caducan</b>. Sin saldo → <code className="bg-gray-100 px-1 rounded">402</code>.
            </div>
            <div className="mb-6 bg-gray-50 border-2 border-gray-300 rounded-xl p-4 text-sm">
              <strong><code className="bg-white px-1 rounded">country</code> es opcional</strong> y son 2 letras (ISO 3166-1): <code className="bg-white px-1 rounded">mx</code> México · <code className="bg-white px-1 rounded">us</code> Estados Unidos · <code className="bg-white px-1 rounded">es</code> España · <code className="bg-white px-1 rounded">ar</code> Argentina · <code className="bg-white px-1 rounded">co</code> Colombia · <code className="bg-white px-1 rounded">cl</code> Chile · <code className="bg-white px-1 rounded">pe</code> Perú · <code className="bg-white px-1 rounded">br</code> Brasil.
              Sirve para ver el sitio como un usuario de ese país (precios en MXN, stock local, resultados de Google localizados). Si lo omites, el proveedor elige. Lista completa: <a href="https://es.wikipedia.org/wiki/ISO_3166-1#C%C3%B3digos_oficialmente_asignados" target="_blank" rel="noreferrer" className="underline">ISO 3166-1</a>. En <code className="bg-white px-1 rounded">web_extract</code> con google_maps va en MAYÚSCULAS dentro del input (<code className="bg-white px-1 rounded">country: "MX"</code>).
            </div>

            <Endpoint
              method="POST"
              path="/web/search"
              description="Busca en Google (o Bing/Yandex/DuckDuckGo) y devuelve resultados estructurados: orgánicos, negocios locales, knowledge panel"
              body={[
                { name: "query", type: "string", desc: "Texto plano (requerido)" },
                { name: "engine", type: "string", desc: "google (default) | bing | yandex | duckduckgo" },
                { name: "country", type: "string", desc: "País en 2 letras: mx (México), us, es, ar, co, cl, pe, br. Ver lista completa abajo" },
              ]}
              response={`{ "query": "…", "engine": "google", "results": { "organic": [ { "title", "link", "description" } ], … } }`}
              note="1 consulta. Úsalo para encontrar la URL correcta y luego léela con /web/fetch."
            />
            <TabbedCode
              tabs={[
                { label: "SDK", code: `const r = await eb.webSearch({ query: "ubiquiti u6 mesh precio", country: "mx" });
console.log(r.results.organic[0].link);` },
                { label: "cURL", code: `curl -X POST https://www.easybits.cloud/api/v2/web/search \\
  -H "Authorization: Bearer $EASYBITS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"ubiquiti u6 mesh precio","country":"mx"}'` },
                { label: "Node.js", code: `const res = await fetch("https://www.easybits.cloud/api/v2/web/search", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.EASYBITS_API_KEY}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "ubiquiti u6 mesh precio", country: "mx" }),
});
const data = await res.json();` },
                { label: "MCP", code: `web_search({ query: "ubiquiti u6 mesh precio", country: "mx" })` },
              ]}
            />
            <div className="mb-8" />

            <Endpoint
              method="POST"
              path="/web/fetch"
              description="Lee una página aunque bloquee bots. Devuelve HTML o markdown"
              body={[
                { name: "url", type: "string", desc: "https://… (requerido)" },
                { name: "country", type: "string", desc: "País en 2 letras: mx (México), us, es, ar, co, cl, pe, br. Ver lista completa abajo" },
                { name: "asMarkdown", type: "boolean", desc: "true → markdown en vez de HTML" },
                { name: "onlyMainContent", type: "boolean", desc: "Con asMarkdown: quita nav, footer, iconos y 'skip to content'. Lo normal cuando vas a leer la página" },
              ]}
              response={`{ "url": "…", "statusCode": 200, "format": "markdown", "body": "# …" }`}
              note="1 consulta. El cuerpo se recorta a 200 KB."
            />
            <TabbedCode
              tabs={[
                { label: "SDK", code: `const page = await eb.webFetch({
  url: "https://www.amazon.com.mx/dp/B09YRZYB29",
  country: "mx",
  asMarkdown: true,
  onlyMainContent: true,
});
console.log(page.body);` },
                { label: "cURL", code: `curl -X POST https://www.easybits.cloud/api/v2/web/fetch \\
  -H "Authorization: Bearer $EASYBITS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://www.amazon.com.mx/dp/B09YRZYB29","country":"mx","asMarkdown":true}'` },
                { label: "Node.js", code: `const res = await fetch("https://www.easybits.cloud/api/v2/web/fetch", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.EASYBITS_API_KEY}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://www.amazon.com.mx/dp/B09YRZYB29", country: "mx", asMarkdown: true }),
});
const data = await res.json();` },
                { label: "MCP", code: `web_fetch({ url: "https://www.amazon.com.mx/dp/B09YRZYB29", country: "mx", asMarkdown: true })` },
              ]}
            />
            <div className="mb-8" />

            <Endpoint
              method="POST"
              path="/web/extract"
              description="Extrae registros con esquema estable de una fuente conocida. Asíncrono: devuelve un job"
              body={[
                { name: "source", type: "string", desc: "google_maps | mercadolibre | amazon_product | amazon_reviews | google_shopping | instagram_profiles | instagram_posts | tiktok_profiles | tiktok_posts | facebook_page_posts | facebook_marketplace | youtube_channels | youtube_videos | linkedin_company | linkedin_person | linkedin_jobs | indeed_jobs | trustpilot | inmuebles24 | reddit_posts" },
                { name: "datasetId", type: "string", desc: "Para fuentes fuera de la lista (catálogo de +1,000)" },
                { name: "input", type: "object | object[]", desc: "google_maps → [{ keyword, country: 'MX' }] · mercadolibre → { query, page? } · resto → [{ url }]" },
                { name: "limit", type: "number", desc: "Registros máximos por input (default 20, máx 200)" },
              ]}
              response={`202 { "jobId": "…", "status": "running", "source": "google_maps" }
// mercadolibre responde al instante:
200 { "jobId": "…", "status": "done", "records": [ { "title", "price", "url", "seller", … } ], "total": 48 }`}
              note="Cobra 1 consulta POR REGISTRO devuelto, una sola vez, al recogerlos. Disparar el job no cuesta; un job que falla no cobra."
            />
            <TabbedCode
              tabs={[
                { label: "SDK", code: `// Espera y devuelve los registros (poll cada 15 s)
const job = await eb.webExtractAndWait({
  source: "google_maps",
  input: [{ keyword: "dentista Polanco CDMX", country: "MX" }],
  limit: 20,
});
// job.records → nombre, teléfono, WhatsApp, sitio, rating, horarios…

// Mercado Libre responde al instante
const meli = await eb.webExtract({ source: "mercadolibre", input: { query: "iphone 15" } });
console.log(meli.records[0].price);` },
                { label: "cURL", code: `curl -X POST https://www.easybits.cloud/api/v2/web/extract \\
  -H "Authorization: Bearer $EASYBITS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"source":"google_maps","input":[{"keyword":"dentista Polanco CDMX","country":"MX"}],"limit":20}'
# → 202 { "jobId": "…", "status": "running" }

curl https://www.easybits.cloud/api/v2/web/extract/$JOB_ID \\
  -H "Authorization: Bearer $EASYBITS_API_KEY"
# → { "status": "done", "records": [ … ], "total": 20 }` },
                { label: "Node.js", code: `const res = await fetch("https://www.easybits.cloud/api/v2/web/extract", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.EASYBITS_API_KEY}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ source: "google_maps", input: [{ keyword: "dentista Polanco CDMX", country: "MX" }], limit: 20 }),
});
const data = await res.json();

// poll hasta que termine
let st;
do {
  await new Promise((r) => setTimeout(r, 15_000));
  st = await fetch(\`https://www.easybits.cloud/api/v2/web/extract/\${data.jobId}\`, {
    headers: { Authorization: \`Bearer \${process.env.EASYBITS_API_KEY}\` },
  }).then((r) => r.json());
} while (st.status === "running");
console.log(st.records);` },
                { label: "MCP", code: `web_extract({ source: "google_maps", input: [{ keyword: "dentista Polanco CDMX", country: "MX" }], limit: 20 })
// → { jobId, status: "running" }
web_extract_status({ jobId })
// → { status: "done", items: [ … ], total: 20 }` },
              ]}
            />
            <div className="mb-8" />

            <Endpoint
              method="GET"
              path="/web/extract/:jobId"
              description="Estado de un job de extract; cuando termina trae los registros"
              response={`{ "jobId": "…", "status": "running" | "done" | "error", "records"?: [...], "total"?: 20 }`}
              note="Gratis mientras corre. Volver a pedir un job ya cobrado no cobra de nuevo. Los jobs con esquema tardan 30-120 s: haz poll cada ~15 s."
            />
            <div className="mb-8" />

            <Endpoint
              method="POST"
              path="/web/crawl"
              description="Lee una página y sigue sus links internos (mismo dominio) hasta maxPages"
              body={[
                { name: "url", type: "string", desc: "URL de inicio (requerido)" },
                { name: "maxPages", type: "number", desc: "1-20, default 10. Cada página leída cuesta 1 consulta" },
                { name: "onlyMainContent", type: "boolean", desc: "Quita nav, footer e iconos de cada página (recomendado para RAG)" },
                { name: "country", type: "string", desc: "País en 2 letras: mx (México), us, es, ar, co, cl, pe, br. Ver lista completa abajo" },
              ]}
              response={`{ "startUrl": "…", "pages": [ { "url", "markdown" } ], "pending": [ "…" ] }`}
              note="1 consulta por página realmente leída. `pending` son los links vistos y no visitados: pásale uno a otra llamada para continuar."
            />
            <TabbedCode
              tabs={[
                { label: "SDK", code: `const site = await eb.webCrawl({ url: "https://docs.ejemplo.com", maxPages: 20, onlyMainContent: true });
for (const p of site.pages) console.log(p.url, p.markdown.length);` },
                { label: "cURL", code: `curl -X POST https://www.easybits.cloud/api/v2/web/crawl \\
  -H "Authorization: Bearer $EASYBITS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://docs.ejemplo.com","maxPages":20}'` },
                { label: "Node.js", code: `const res = await fetch("https://www.easybits.cloud/api/v2/web/crawl", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.EASYBITS_API_KEY}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://docs.ejemplo.com", maxPages: 20 }),
});
const data = await res.json();` },
                { label: "MCP", code: `web_crawl({ url: "https://docs.ejemplo.com", maxPages: 20 })` },
              ]}
            />
            <div className="mb-8" />

            <h3 className="text-lg font-bold mb-3">Tools MCP</h3>
            <p className="text-sm text-gray-600 mb-3">Conecta <code className="bg-gray-100 px-1 rounded">https://www.easybits.cloud/api/mcp/web</code> con tu API key como Bearer.</p>
            <div className="space-y-2">
              <McpTool name="web_search" params="query, engine?, country?" description="Busca en Google y devuelve resultados estructurados. 1 consulta." />
              <McpTool name="web_fetch" params="url, country?, asMarkdown?, onlyMainContent?" description="Lee una página aunque bloquee bots. 1 consulta." />
              <McpTool name="web_extract" params="source | datasetId, input, limit?" description="Extrae registros con esquema (Maps, Mercado Libre, Amazon, Instagram…). Async con jobId; 1 consulta por registro." />
              <McpTool name="web_extract_status" params="jobId" description="Estado/registros de un extract. Gratis mientras corre." />
              <McpTool name="web_crawl" params="url, maxPages?, country?, onlyMainContent?" description="Rastrea un sitio siguiendo links internos. 1 consulta por página." />
            </div>
            <p className="text-sm text-gray-600 mt-4">
              Ejemplo de flujo: <code className="bg-gray-100 px-1 rounded">web_search("ubiquiti u6 mesh precio", country: "mx")</code> → tomar el link de Amazon MX →{" "}
              <code className="bg-gray-100 px-1 rounded">web_fetch(url, asMarkdown: true)</code> → el agente lee título y precio. Dos consultas.
            </p>
          </section>

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
              method="PATCH"
              path="/forms/:formId"
              description="Actualiza nombre, theme, campos o mensaje de éxito de un formulario."
              body={[
                { name: "name", type: "string", desc: "Nuevo nombre (opcional)" },
                { name: "theme", type: "string", desc: "Nuevo template (opcional)" },
                { name: "fields", type: "FormField[]", desc: "Reemplaza los campos (opcional)" },
                { name: "successMessage", type: "string", desc: "Nuevo mensaje al enviar (opcional)" },
              ]}
              sdk={`await eb.updateForm("form_id", { theme: "institucional" });`}
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

          {/* Video Projects */}
          <section id="video-projects" className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Video</h2>
            <p className="text-gray-600 mb-6 text-sm">
              Videos editables por <strong>escenas</strong> que compilan a MP4. Cada escena es una composición{" "}
              <a href="https://github.com/heygen-com/hyperframes" className="underline" target="_blank" rel="noopener noreferrer">HyperFrames</a>:
              tú das el HTML de la escena (posicionado absoluto, assets como <code className="bg-gray-100 px-1 rounded">assets/&lt;name&gt;</code>)
              y un snippet de timeline GSAP opcional contra un <code className="bg-gray-100 px-1 rounded">tl</code> pausado.
              Agrega <strong>narración</strong> por escena → se sintetiza con kokoro (voz <code className="bg-gray-100 px-1 rounded">em_santa</code>)
              y se muxea sola; la escena se estira para que la voz quepa. El render corre en un microVM on-demand (decenas de segundos)
              y el MP4 aterriza en tus archivos, público. Vertical 1080×1920 por default (presets: <code className="bg-gray-100 px-1 rounded">reel</code>/<code className="bg-gray-100 px-1 rounded">story</code>/<code className="bg-gray-100 px-1 rounded">tiktok</code> 9:16, <code className="bg-gray-100 px-1 rounded">square</code> 1:1, <code className="bg-gray-100 px-1 rounded">landscape</code> 16:9).
            </p>

            <Endpoint
              method="GET"
              path="/video-projects"
              description="Lista tus proyectos de video"
              response={`{ "total": 3, "items": [{ "id": "vp123", "name": "Launch reel", "status": "ready", "sceneCount": 3, "durationSec": 13, "lastRenderUrl": "https://..." }] }`}
              sdk={`const { items } = await eb.listVideoProjects();`}
            />

            <Endpoint
              method="POST"
              path="/video-projects"
              description="Crea un proyecto de video (vacío o con escenas)"
              body={[
                { name: "name", type: "string", desc: "Nombre del proyecto" },
                { name: "format", type: "object", desc: "Preset de aspecto: { preset: 'reel' | 'story' | 'square' | 'landscape' }" },
                { name: "theme", type: "string", desc: "Fondo: default | dark | light | brand" },
                { name: "scenes", type: "array", desc: "Escenas iniciales opcionales [{ html, timeline?, durationSec?, narration? }]" },
              ]}
              response={`{ "project": { "id": "vp123", "name": "Launch reel", "status": "draft" } }`}
              sdk={`const p = await eb.createVideoProject({ name: "Launch reel", format: { preset: "reel" }, theme: "dark" });`}
            />

            <Endpoint
              method="POST"
              path="/video-projects/:id/scenes"
              description="Agrega una escena (markup + animación + narración)"
              body={[
                { name: "html", type: "string", desc: "Markup de la escena (absoluto; assets como assets/<name>)" },
                { name: "timeline", type: "string", desc: "Snippet GSAP contra `tl` (ej. tl.from('#t',{opacity:0,y:40,duration:0.6}))" },
                { name: "durationSec", type: "number", desc: "Duración; si hay narración, se ajusta para que quepa" },
                { name: "narration", type: "string", desc: "Texto de voz en off (kokoro em_santa)" },
              ]}
              response={`{ "scene": { "id": "sc1", "order": 0, "durationSec": 3.2 }, "sceneCount": 1 }`}
              sdk={`await eb.addVideoScene(p.id, { html: "<div id='t' style='...'>EasyBits</div>", timeline: "tl.from('#t',{opacity:0,y:60,duration:0.7})", narration: "Bienvenido a EasyBits." });`}
            />

            <Endpoint
              method="PATCH"
              path="/video-projects/:id/scenes/:sceneId"
              description="Edita una escena. Cambiar narration re-sintetiza la voz en el próximo render."
              sdk={`await eb.setVideoScene(p.id, "sc1", { durationSec: 4 });`}
            />

            <Endpoint
              method="PUT"
              path="/video-projects/:id/audio"
              description="Registra un asset (imagen/logo) que la caja baja a assets/; referéncialo en el HTML como assets/<name>"
              body={[
                { name: "url", type: "string", desc: "URL pública del asset" },
                { name: "name", type: "string", desc: "Nombre de archivo, ej. logo.png" },
              ]}
              sdk={`await eb.attachVideoAsset(p.id, { url: "https://www.easybits.cloud/logo-purple.svg", name: "eyes.svg" });`}
            />

            <Endpoint
              method="POST"
              path="/video-projects/:id/audio"
              description="Música de fondo continua (auto-duckeada bajo la narración). url: null para quitar."
              body={[{ name: "url", type: "string", desc: "URL pública de audio (o null)" }]}
              sdk={`await eb.setVideoMusic(p.id, "https://.../bgm.mp3", "bgm.mp3");`}
            />

            <Endpoint
              method="POST"
              path="/video-projects/:id/render"
              description="Compila, sintetiza la narración pendiente y renderiza a MP4 en el microVM. Síncrono (decenas de segundos)."
              response={`{ "status": "ready", "file": { "fileId": "f_abc", "url": "https://...mp4", "renderMs": 76000 } }`}
              sdk={`const { file } = await eb.renderVideoProject(p.id); // → { fileId, url, renderMs }`}
            />

            <h3 className="text-lg font-bold mt-8 mb-4">MCP tools (12)</h3>
            <div className="space-y-2">
              <McpTool name="create_video_project" params="name?, format?, theme?, scenes?" description="Crea un proyecto de video doc-style." />
              <McpTool name="list_video_projects" params="limit?, offset?, status?" description="Lista proyectos de video." />
              <McpTool name="get_video_project" params="projectId" description="Proyecto con su lista completa de escenas." />
              <McpTool name="update_video_project" params="projectId, name?, theme?, fps?, width?, height?" description="Actualiza metadata (no toca escenas)." />
              <McpTool name="delete_video_project" params="projectId" description="Elimina el proyecto." />
              <McpTool name="add_video_scene" params="projectId, html, timeline?, durationSec?, narration?, afterIndex?" description="Agrega una escena." />
              <McpTool name="set_video_scene" params="projectId, sceneId, html?, timeline?, durationSec?, narration?" description="Edita una escena por id." />
              <McpTool name="delete_video_scene" params="projectId, sceneId" description="Elimina una escena." />
              <McpTool name="reorder_video_scenes" params="projectId, sceneIds" description="Reordena todas las escenas." />
              <McpTool name="set_video_music" params="projectId, url, name?" description="Música de fondo (o url:null para quitar)." />
              <McpTool name="attach_video_asset" params="projectId, url, name?, type?" description="Registra imagen/logo como asset." />
              <McpTool name="render_video_project" params="projectId" description="Compila + renderiza a MP4 con narración kokoro." />
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
const sbx = await eb.sandboxes.create({ template: "python", timeoutSeconds: 300 });
console.log(sbx.sandboxId);

// 2. Ejecutar código
const { stdout } = await sbx.exec("python3 -c 'print(2+2)'");
console.log(stdout); // "4"

// 3. Destruir (libera recursos)
await sbx.destroy();` },
                { label: "MCP", code: `# Mismo flujo desde herramientas MCP:
# sandbox_create(template:"python")
# sandbox_exec(sandboxId, command:"python3 -c 'print(2+2)'")
# sandbox_destroy(sandboxId)` },
                { label: "REST", code: `# 1. Crear sandbox Python
curl -X POST https://www.easybits.cloud/api/v2/sandboxes \\
  -H "Authorization: Bearer eb_sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"template":"python","timeoutSeconds":300}'
# → {"sandboxId":"sb_...", ...}

# 2. Ejecutar un comando
curl -X POST https://www.easybits.cloud/api/v2/sandboxes/sb_.../exec \\
  -H "Authorization: Bearer eb_sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"command":"python3 -c \\'print(2+2)\\'"}'
# → {"stdout":"4\\n","stderr":"","exitCode":0}

# 3. Destruir
curl -X DELETE https://www.easybits.cloud/api/v2/sandboxes/sb_... \\
  -H "Authorization: Bearer eb_sk_live_..."` },
              ]}
            />

            <h3 className="text-lg font-bold mt-8 mb-3">Endpoints REST</h3>
            <p className="text-gray-600 text-sm mb-3">
              Todo el SDK corre sobre estos endpoints. Base: <code className="bg-gray-100 px-1 rounded">https://www.easybits.cloud/api/v2</code>. Auth por header <code className="bg-gray-100 px-1 rounded">Authorization: Bearer eb_sk_live_...</code> — ver <a href="#auth" className="underline">Autenticación</a>.
            </p>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm border-2 border-black rounded-xl overflow-hidden">
                <thead className="bg-black text-white">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs uppercase">Método &amp; ruta</th>
                    <th className="text-left px-4 py-2 text-xs uppercase">Body</th>
                    <th className="text-left px-4 py-2 text-xs uppercase">Qué hace</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["GET", "/sandboxes", "—", "Lista tus sandboxes vivas"],
                    ["POST", "/sandboxes", "template*, timeoutSeconds, name, size, metadata, persistent, suspendOnIdle, hardTtlSeconds", "Crea una microVM"],
                    ["GET", "/sandboxes/:id", "—", "Estado de una caja"],
                    ["DELETE", "/sandboxes/:id", "—", "La destruye"],
                    ["POST", "/sandboxes/:id/exec", "command*, cwd, env, timeoutSeconds", "Corre un comando de shell"],
                    ["POST", "/sandboxes/:id/run-code", "code*, lang (python|node|bash), timeoutSeconds", "Ejecuta código en proceso fresco"],
                    ["POST", "/sandboxes/:id/run-cell", "code*, timeoutSeconds", "Celda en el kernel persistente"],
                    ["POST", "/sandboxes/:id/kernel-restart", "—", "Reinicia el kernel Jupyter"],
                    ["POST", "/sandboxes/:id/expose", "port*", "URL pública HTTPS del puerto"],
                    ["POST", "/sandboxes/:id/expose-raw", "port*, protocol* (tcp|udp)", "Forward L4 crudo"],
                    ["POST", "/sandboxes/:id/unexpose-raw", "port*, protocol*", "Cierra el forward L4"],
                    ["POST", "/sandboxes/:id/suspend", "—", "Duerme la caja (snapshot)"],
                    ["POST", "/sandboxes/:id/resume", "—", "La despierta"],
                    ["POST", "/sandboxes/:id/extend", "extendSeconds", "Alarga el TTL"],
                    ["POST", "/sandboxes/:id/snapshot", "name", "Congela el disco en una imagen"],
                    ["POST", "/sandboxes/:id/fork", "count, name, metadata, timeoutSeconds", "Clona N hijos copy-on-write"],
                    ["POST", "/sandboxes/:id/logs", "—", "Lee logs"],
                    ["POST", "/sandboxes/:id/apply-patch", "—", "Aplica un patch de archivos"],
                    ["POST", "/sandboxes/:id/ssh-enable", "—", "Habilita SSH (ver arriba)"],
                    ["POST", "/sandboxes/:id/domain-add", "—", "Dominio propio + HTTPS"],
                    ["GET", "/sandboxes/:id/files/read", "?path=", "Lee un archivo"],
                    ["GET", "/sandboxes/:id/files/list", "?path=", "Lista un directorio"],
                    ["POST", "/sandboxes/:id/files/write", "path*, content*", "Escribe un archivo"],
                    ["POST", "/sandboxes/:id/files/delete", "path*", "Borra"],
                    ["POST", "/sandboxes/:id/files/move", "from*, to*", "Mueve o renombra"],
                    ["POST", "/sandboxes/:id/files/mkdir", "path*", "Crea directorio"],
                  ].map(([method, path, body, desc], i) => (
                    <tr key={path as string} className={i % 2 ? "border-t border-gray-200 bg-gray-50" : "border-t border-gray-200"}>
                      <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                        <span className="font-bold">{method}</span> {path}
                      </td>
                      <td className="px-4 py-2 font-mono text-[11px] text-gray-600">{body}</td>
                      <td className="px-4 py-2 text-xs text-gray-600">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-gray-500 text-xs mb-6">
              <code className="bg-gray-100 px-1 rounded">*</code> = requerido. Un body inválido devuelve <code className="bg-gray-100 px-1 rounded">400</code> con <code className="bg-gray-100 px-1 rounded">issues[]</code> de Zod. Crear sandboxes tiene rate limit propio — ver <a href="#errors" className="underline">Errores &amp; Límites</a>.
            </p>

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
const sbx = await eb.sandboxes.create({ template: "ubuntu" });

// 2. Arrancar un server Node en background
//    'exec' hace que el shell sea REEMPLAZADO por node: así el kill
//    le llega al proceso real y no deja el puerto ocupado.
const { execId } = await sbx.execBackground("exec npx -y serve /app -l 3000");

// 3. Exponer el puerto → URL pública
const { url } = await sbx.exposePort(3000);
console.log(url); // https://sb-abc123-3000.sandboxes.easybits.cloud

// 4. Cuando termines: await sbx.bgKill(execId);
//    ¿Perdiste el execId? await sbx.bgList();`} />

            <p className="text-gray-600 text-sm mt-3">
              Tu servicio debe bindear a <code className="bg-gray-100 px-1 rounded">0.0.0.0</code>, no a <code className="bg-gray-100 px-1 rounded">127.0.0.1</code>: el proxy dialea la IP del guest, así que un bind a loopback es inalcanzable por diseño (igual que en Docker, Fly o Cloud Run). Si al exponer el puerto ya hay algo escuchando sólo en loopback, la respuesta trae un campo <code className="bg-gray-100 px-1 rounded">warning</code> y la URL responderá 502 hasta que lo cambies.
            </p>

            <h3 className="text-lg font-bold mt-8 mb-3">Puertos raw (TCP/UDP)</h3>
            <p className="text-gray-600 text-sm mb-3">
              <code className="bg-gray-100 px-1 rounded">sandbox_expose_port</code> ya sirve <strong>capa 7 con TLS: HTTP y WebSocket</strong> — la misma URL responde <code className="bg-gray-100 px-1 rounded">https://</code> y <code className="bg-gray-100 px-1 rounded">wss://</code>, sin túnel ni puerto raw. Lo que no hace es <strong>capa 4 cruda</strong>: los puertos 22, 23, 25, 445 y 3389 se rechazan con 400. Para un servicio que no habla HTTP usa el forward de capa 4.
            </p>
            <CodeExample title="SDK" code={`const fwd = await sb.exposeRawPort(22, "tcp");
// {
//   hostPort: 49123, guestPort: 22, protocol: "tcp",
//   host: "cname.sandboxes.easybits.cloud",
//   endpoint: "cname.sandboxes.easybits.cloud:49123", ok: true
// }
console.log(fwd.endpoint); // marca ESTO; no lo armes a mano`} />
            <ul className="list-disc ml-5 mt-3 text-sm text-gray-600 space-y-1">
              <li>El <code className="bg-gray-100 px-1 rounded">hostPort</code> sale de un pool (49000-49999): es distinto por caja y <strong>no</strong> es igual al puerto de adentro — así cada caja tiene su propio 22.</li>
              <li>No es estable: se libera al destruir la caja y se re-asigna. Vuelve a leerlo; no lo guardes ni lo pongas fijo en tu UI.</li>
              <li>Gateado por el template: un <strong>403</strong> significa "este template no tiene ese puerto". Es definitivo, no reintentes.</li>
              <li>Cerrarlo: <code className="bg-gray-100 px-1 rounded">sandbox_unexpose_raw_port</code>.</li>
            </ul>

            <h3 className="text-lg font-bold mt-8 mb-3">SSH a una caja</h3>
            <p className="text-gray-600 text-sm mb-3">
              Una sola llamada inyecta tu llave, reinicia el sshd de la caja y abre el 22. Te devuelve el comando listo para pegar.
            </p>
            <p className="text-gray-600 text-sm mb-3">
              La llave pública sale del CLI. <strong>No la escribas a mano ni elijas una de <code className="bg-gray-100 px-1 rounded">~/.ssh</code></strong>: inyectar una pública que no corresponde a la privada con la que luego conectas da <code className="bg-gray-100 px-1 rounded">Permission denied</code> con todo lo demás correcto, y es el error más común de este flujo.
            </p>
            <CodeExample title="1. En tu máquina" code={`easybits ssh-key
# ssh-ed25519 AAAAC3Nza... easybits
#
# La crea en ~/.ssh/easybits_ed25519 la primera vez y siempre devuelve la misma.
# Es también la que usa \`easybits ssh-proxy\` al conectar, así que no pueden
# desfasarse. La PRIVADA nunca sale de tu máquina.`} />
            <CodeExample title="2. Inyectarla en la caja" code={`// pásale exactamente lo que imprimió \`easybits ssh-key\`
const ssh = await sb.enableSsh([process.env.MY_SSH_PUBKEY!]);

console.log(ssh.tunnel.command);  // ssh mi-caja.ghosty        ← entrégale ESTE
console.log(ssh.command);         // ssh -p 49002 root@<host>  ← respaldo`} />
            <ul className="list-disc ml-5 mt-3 text-sm text-gray-600 space-y-1">
              <li>El sshd de la caja es <strong>fail-closed</strong>: sin llave no arranca. Por eso la llave va primero — una caja sin llave no tiene superficie SSH ni siquiera cerrada.</li>
              <li>Acceso <strong>solo por llave</strong>, como <code className="bg-gray-100 px-1 rounded">root</code>. Varias llaves: una por elemento del array.</li>
              <li>La host key vive en <code className="bg-gray-100 px-1 rounded">/app/ssh/</code>: el fingerprint sobrevive reinicios y resume, así que no verás el warning de MITM en cada boot.</li>
              <li><code className="bg-gray-100 px-1 rounded">sandbox_ssh_disable</code> cierra el puerto pero <strong>no</strong> revoca: para eso quita la llave de <code className="bg-gray-100 px-1 rounded">/app/secrets.env</code>.</li>
              <li>Solo en templates que declaren el 22 (hoy <code className="bg-gray-100 px-1 rounded">ghosty-studio</code>).</li>
            </ul>

            <h3 id="ssh" className="text-lg font-bold mt-8 mb-3 scroll-mt-24">SSH por túnel — recomendado</h3>
            <p className="text-gray-600 text-sm mb-3">
              El comando de arriba usa un puerto alto del anfitrión, y <strong>un puerto alto no atraviesa la red de una oficina ni una VPN corporativa</strong>. Eso te llega como “no me conecta” desde una red que no puedes reproducir. El túnel entra por el mismo 443 de siempre: si el usuario puede abrir una página web, entra a su caja.
            </p>
            <CodeExample title="Una vez" code={`npm i -g @easybits.cloud/cli
easybits login <tu-api-key>

# tu llave pública, para sandbox_ssh_enable (la crea si no existe)
easybits ssh-key`} />
            <p className="text-gray-600 text-sm mt-3 mb-2">En <code className="bg-gray-100 px-1 rounded">~/.ssh/config</code>:</p>
            <CodeExample title="~/.ssh/config" code={`Host *.ghosty
  ProxyCommand easybits ssh-proxy %h
  User root`} />
            <p className="text-gray-600 text-sm mt-3 mb-2">Y ya:</p>
            <CodeExample title="Terminal" code={`ssh mi-caja.ghosty      # el nombre que le diste al crearla
ssh sb_abc123.ghosty    # el id también sirve

# ACP remoto: el editor en tu Mac, el agente en la caja
ssh mi-caja.ghosty "cd /data/work && ghosty serve --acp"`} />
            <ul className="list-disc ml-5 mt-3 text-sm text-gray-600 space-y-1">
              <li>Sigue haciendo falta <code className="bg-gray-100 px-1 rounded">ssh-enable</code> una vez, para inyectar la llave: el sshd de la caja es fail-closed. Pásale la salida de <code className="bg-gray-100 px-1 rounded">easybits ssh-key</code> — es la misma que usa <code className="bg-gray-100 px-1 rounded">ssh-proxy</code> al conectar, así que no pueden desfasarse. <strong>La privada nunca sale de tu máquina.</strong></li>
              <li>El <strong>nombre</strong> de la caja sirve como host. No es único ni secreto: si dos cajas lo comparten el proxy falla en vez de elegir, porque entrar a la equivocada es peor que no entrar. Que sea público da igual — la sesión se autentica con tu llave y el ticket, nunca con el nombre.</li>
              <li><strong>El túnel no autentica.</strong> Mueve bytes opacos; la sesión SSH se autentica de punta a punta entre tu <code className="bg-gray-100 px-1 rounded">ssh</code> y el sshd de la caja. Un fallo en el túnel no le da acceso a nadie.</li>
              <li>El CLI pide un <strong>ticket firmado de vida corta</strong> (<code className="bg-gray-100 px-1 rounded">sb.sshTicket()</code>) y abre el WebSocket. Normalmente no lo llamas tú.</li>
              <li>Ticket vencido, firma alterada o caja ajena: <strong>403/404</strong> en el borde, sin llegar al anfitrión.</li>
            </ul>

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
            <CodeExample title="SDK" code={`const sbx = await eb.sandboxes.create({ template: "code-interpreter" });

// Celda 1: cargar datos
await sbx.runCell(\`import pandas as pd
df = pd.read_csv("ventas.csv")
print(df.head())\`);

// Celda 2: usar variable de la celda anterior + gráfica
await sbx.runCell(\`df.groupby("mes")["total"].sum().plot(kind="bar")\`);
// ← la gráfica se devuelve como imagen`} />

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

            <h3 className="text-lg font-bold mt-8 mb-3">¿Se despierta sola?</h3>
            <p className="mb-3">
              Depende de quién le hable, y es la pregunta que más se repite:
            </p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li>
                <strong>Agente de flota</strong> (los que corren tus conversaciones): <strong>sí</strong>.
                Si su caja está suspendida, el turno la reanuda antes de correr, y si el snapshot
                se perdió arranca una VM limpia con la memoria restaurada. No hace falta que el
                usuario vuelva a escribir ni que llames a <code className="bg-gray-100 px-1 rounded">sandbox_resume</code>.
              </li>
              <li>
                <strong>Sandbox tuyo con tu propio servidor</strong>: <strong>no</strong>. Ahí no hay
                turno de agente, así que nada la reanuda por ti. Llama a{" "}
                <code className="bg-gray-100 px-1 rounded">sandbox_resume</code> desde tu backend
                antes de usarla.
              </li>
            </ul>
            <p className="mb-6">
              ⚠️ <strong>Una conexión no despierta una caja</strong>: abrir un WebSocket contra una
              caja suspendida no la reanuda, negocia contra una máquina apagada. El error aparece
              en el cliente mientras tu servidor cree que todo fue bien. Reanuda primero, conecta
              después.
            </p>

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
                ["sandbox_exec", "sandboxId, command", "Ejecutar comando (sync, 60s por defecto, tope 600s)"],
                ["sandbox_exec_background", "sandboxId, command", "Ejecutar comando en background"],
                ["sandbox_exec_list", "sandboxId", "Listar procesos en background (recupera un execId perdido)"],
                ["sandbox_exec_status", "sandboxId, execId", "Consultar estado de ejecución background"],
                ["sandbox_exec_kill", "sandboxId, execId", "Matar una ejecución background (lo que falta cuando algo se cuelga)"],
                ["sandbox_run_code", "sandboxId, code, lang", "Ejecutar Python/Node/Bash inline"],
                ["sandbox_run_cell", "sandboxId, code", "Ejecutar celda en kernel Jupyter persistente"],
                ["sandbox_files_write", "sandboxId, path, content", "Escribir archivo en el sandbox"],
                ["sandbox_files_read", "sandboxId, path", "Leer archivo del sandbox"],
                ["sandbox_files_list", "sandboxId, path", "Listar directorio"],
                ["sandbox_files_edit", "sandboxId, path, oldString, newString", "Edición quirúrgica in-place (sin escaping de shell)"],
                ["sandbox_logs", "sandboxId, unit?, lines?, since?, grep?", "Logs journald nativos del daemon"],
                ["sandbox_runtime", "sandboxId, action, unit?, buildCommand?", "systemd status/restart/rebuild del daemon"],
                ["sandbox_apply_patch", "sandboxId, edits[], rebuild?, restart?", "Hotfix atómico: edita → rebuild → restart"],
                ["sandbox_admin", "sandboxId, path, method?, body?", "Pasarela al admin API interno (:8787) de una máquina permanente"],
                ["sandbox_expose_port", "sandboxId, port", "Exponer puerto como URL pública HTTPS (solo HTTP)"],
                ["sandbox_expose_raw_port", "sandboxId, port, protocol", "Forward TCP/UDP crudo; devuelve endpoint host:hostPort"],
                ["sandbox_unexpose_raw_port", "sandboxId, port, protocol", "Cerrar el forward TCP/UDP"],
                ["sandbox_ssh_enable", "sandboxId, publicKeys[]", "SSH a la caja: inyecta llave, abre el 22, devuelve el comando"],
                ["sandbox_ssh_disable", "sandboxId", "Cerrar el puerto SSH (no revoca la llave)"],
                ["sandbox_domain_add", "sandboxId, domain, port", "Atar dominio propio (devuelve el registro DNS: CNAME o A)"],
                ["sandbox_domain_remove", "sandboxId, domain", "Quitar dominio personalizado"],
                ["sandbox_domain_list", "sandboxId", "Listar dominios del sandbox"],
                ["sandbox_domain_verify", "domain", "Confirmar DNS + cert TLS del dominio"],
                ["agent_create", "template", "Crear agente persistente (endpoint HTTP)"],
                ["agent_list", "—", "Listar agentes persistentes"],
                ["agent_message", "agentId, content", "Enviar mensaje a un agente"],
                ["fleet_agent_list", "—", "Grupo fleet · listar los agentes de la flota (WhatsApp/web/Teams)"],
                ["fleet_agent_capabilities", "fleetAgentId", "Grupo fleet · config actual de un agente (= GET /capabilities)"],
                ["fleet_agent_configure", "fleetAgentId, action, params?", "Grupo fleet · aplicar una acción de /capabilities"],
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

          {/* Ghosty Lite — agente ACP en su propia microVM, cerebro medido con TU llave */}
          <section id="ghosty-lite" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Ghosty Lite</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Un agente de verdad en su propia microVM: fork ligero de <a href="https://block.github.io/goose/" className="underline" target="_blank" rel="noreferrer">goose</a> escrito en Rust, que habla{" "}
              <a href="https://agentclientprotocol.com" className="underline" target="_blank" rel="noreferrer">ACP</a> nativo. Tiene shell, edita archivos, y su disco (<code className="bg-gray-100 px-1 rounded">/data</code>) sobrevive a que se duerma.
              Lo que lo distingue: <strong>corre con TU llave de EasyBits como cerebro</strong> — no traes llave de OpenAI ni de Anthropic, y el consumo se descuenta de tus tokens.
            </p>

            <div className="mb-6 bg-green-50 border-2 border-green-300 rounded-xl p-4 text-sm">
              <strong>Una sola llave.</strong> Tu <code className="bg-gray-100 px-1 rounded">eb_sk_live_…</code> es la credencial del modelo (vía el{" "}
              <a href="#llm" className="underline">proxy LLM</a>, modelo <code className="bg-gray-100 px-1 rounded">deepseek-v4-pro</code>). Necesita scope{" "}
              <strong>WRITE</strong> y saldo de tokens: míralo en <code className="bg-gray-100 px-1 rounded">GET /api/v2/llm/balance</code>.
            </div>

            <h3 className="text-lg font-bold mb-3">De cero a conectado</h3>
            <p className="text-gray-600 text-sm mb-4">
              Cuatro llamadas. Cada quien con su propia llave: el agente es suyo y su consumo se descuenta de su cuenta.
            </p>

            <p className="text-sm font-bold mb-2">1. Crear el agente</p>
            <p className="text-gray-600 text-sm mb-2">
              Primero tu llave (ésta la editas: pega la tuya, de{" "}
              <a href="/dash/developer" className="underline">Dashboard → Developer</a>):
            </p>
            <CodeExample title="bash" code={`export EASYBITS_API_KEY="eb_sk_live_…"`} />
            <p className="text-gray-600 text-sm mb-2 mt-4">Y ahora sí, el comando tal cual:</p>
            <CodeExample
              title="bash"
              code={`curl -X POST https://www.easybits.cloud/api/v2/agents \\
  -H "Authorization: Bearer $EASYBITS_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{ "template": "ghosty-lite", "name": "mi-agente", "env": {} }' \\
  | python3 -m json.tool`}
            />
            <ResponseExample
              code={`{
  "agentId":    "6a99…",        // lo necesitas en el paso 2
  "embedToken": "agt_…",        // ES el token del agente: va en la URL wss
  "sandboxId":  "sb_…",
  "agentUrl":   "sandbox://…"   // provisional, NO la uses
}`}
            />

            <p className="text-sm font-bold mb-2">2. Esperar a que esté listo y tomar la URL</p>
            <p className="text-gray-600 text-sm mb-3">
              Copia de la respuesta anterior el <code className="bg-gray-100 px-1 rounded">agentId</code> y el{" "}
              <code className="bg-gray-100 px-1 rounded">embedToken</code>, y guárdalos en variables:
            </p>
            <CodeExample
              title="bash"
              code={`export AGENT_ID="6a99…"
export AGENT_TOKEN="agt_…"`}
            />
            <p className="text-gray-600 text-sm mb-2 mt-4">Y consultas su estado:</p>
            <CodeExample
              title="bash"
              code={`curl https://www.easybits.cloud/api/v2/agents/$AGENT_ID \\
  -H "Authorization: Bearer $EASYBITS_API_KEY" \\
  | python3 -m json.tool`}
            />
            <ResponseExample
              code={`{
  "status":   "running",
  "agentUrl":
    "wss://acp-6a99….sandboxes.easybits.cloud/acp"   // ÉSTA
}`}
            />

            <p className="text-sm font-bold mb-2">3. Conectar tu cliente</p>
            <CodeExample
              title="bash"
              code={`echo "wss://acp-$AGENT_ID.sandboxes.easybits.cloud/acp?token=$AGENT_TOKEN"`}
            />
            <p className="text-gray-600 text-sm mb-6">
              La URL del paso 2 más el token del paso 1. Sin token, o con uno equivocado, responde{" "}
              <code className="bg-gray-100 px-1 rounded">401</code>.
            </p>

            <p className="text-sm font-bold mb-2">4. Ver tu saldo</p>
            <CodeExample
              title="curl"
              code={`curl https://www.easybits.cloud/api/v2/llm/balance \\
  -H "Authorization: Bearer $EASYBITS_API_KEY" \\
  | python3 -m json.tool`}
            />
            <ResponseExample
              code={`{
  "plan": "Mega",
  "balance_infos": [{ "remaining_human": "37.3M" }]
}`}
            />

            <div className="mb-8 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 text-sm">
              <strong>Dos cosas que parecen "no funciona" y no lo son:</strong> la URL{" "}
              <code className="bg-gray-100 px-1 rounded">wss</code> sale del paso 2, no del 1 — en el 1 todavía viene una provisional{" "}
              <code className="bg-gray-100 px-1 rounded">sandbox://…</code>. Y tu llave necesita scope <strong>WRITE</strong> y saldo de tokens:
              sin saldo el agente responde <code className="bg-gray-100 px-1 rounded">402 insufficient_quota</code> y parece mudo.
            </div>

            <h3 className="text-lg font-bold mb-3">La API en detalle</h3>
            <p className="text-gray-600 text-sm mb-4">
              Lo de arriba es todo lo que hace falta. Esto es la referencia de los mismos endpoints, y dos cosas que conviene entender:{" "}
              <code className="bg-gray-100 px-1 rounded">running</code> significa que EasyBits ya hizo el{" "}
              <code className="bg-gray-100 px-1 rounded">initialize</code> + <code className="bg-gray-100 px-1 rounded">session/new</code> y guardó la sesión (~6 s) — antes de eso no hay
              a quién mandarle el mensaje. Y el <code className="bg-gray-100 px-1 rounded">env</code> vacío es lo normal: sólo lo llenas para{" "}
              <a href="#ghosty-lite" className="underline">cambiar de cerebro</a> o para elegir tú el token{" "}
              (<code className="bg-gray-100 px-1 rounded">{'{ "ACP_AGENT_TOKEN": "el-tuyo" }'}</code>, y entonces el{" "}
              <code className="bg-gray-100 px-1 rounded">embedToken</code> deja de servir).
            </p>
            <Endpoint
              method="POST"
              path="/api/v2/agents"
              description="Crea el agente. Devuelve agentId y embedToken; su agentUrl es provisional todavía."
              body={[
                { name: "template", type: "string", desc: '"ghosty-lite" (requerido)' },
                { name: "name", type: "string", desc: "Cómo lo verás en tu lista de agentes" },
                { name: "env", type: "object", desc: "Vacío para el cerebro medido con tu llave. Ver Otro cerebro." },
              ]}
            />
            <Endpoint
              method="GET"
              path="/api/v2/agents/:agentId"
              description="Estado del agente. Cuando status es running, agentUrl trae la URL WebSocket estable."
              response={`{
  "agentId":  "6a99a0e17b00aaaff1c58280",
  "status":   "running",
  "template": "ghosty-lite",
  "agentUrl":
    "wss://acp-6a99a0e17b00aaaff1c58280.sandboxes.easybits.cloud/acp"
}`}
            />

            <h3 className="text-lg font-bold mb-3 mt-8">Hablarle por HTTP</h3>
            <CodeExample
              title="curl"
              code={`curl -N -X POST https://www.easybits.cloud/api/v2/agents/$AGENT_ID/message \\
  -H "Authorization: Bearer $EASYBITS_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{"content":"hola, ¿qué puedes hacer?"}'`}
            />
            <Endpoint
              method="POST"
              path="/api/v2/agents/:agentId/message"
              description="Un turno de conversación. Devuelve SSE. Sirve la eb_sk del dueño o el embedToken desde el navegador."
              body={[
                { name: "content", type: "string", desc: "El mensaje del usuario (requerido)" },
                { name: "sessionId", type: "string", desc: "Hilo de conversación (default 'default'). Un id por visitante en embeds multi-usuario." },
              ]}
              response={`data: {"type":"chunk","value":"Hola"}
data: {"type":"chunk","value":", ¿en qué te ayudo?"}
data: {"type":"usage","inputTokens":8421,"outputTokens":112,"totalTokens":8533}
data: {"type":"done","stopReason":"end_turn"}`}
              note="Eso de arriba es lo que RECIBES, no lo que mandas. El evento usage llega justo antes del done, cuando el agente lo reporta, y son totales de la SESIÓN, no del turno."
            />

            <h3 className="text-lg font-bold mb-3 mt-8">Desde tu editor o cliente ACP</h3>
            <p className="text-gray-600 text-sm mb-4">
              Zed, JetBrains, VS Code, Ghosty Teams o cualquier cliente ACP se conectan a la <strong>URL estable del agente</strong>. Lleva el{" "}
              <code className="bg-gray-100 px-1 rounded">agentId</code>, no la máquina: si el host recicla la caja, la URL sigue siendo la misma.
              El token <strong>siempre va en la URL</strong> (<code className="bg-gray-100 px-1 rounded">?token=</code>) porque es lo único que todo cliente sabe pasar — un WebSocket
              de navegador no puede poner cabeceras. Si el tuyo puede, <code className="bg-gray-100 px-1 rounded">Authorization: Bearer</code> también vale.
            </p>
            <CodeExample
              title="bash"
              code={`# A) Tu cliente habla WebSocket: pásale la URL con el token dentro.
echo "wss://acp-$AGENT_ID.sandboxes.easybits.cloud/acp?token=$AGENT_TOKEN"

# B) Tu editor habla ACP por stdio (Zed, JetBrains, neovim): usa el puente.
#    OJO: el token va en GHOSTY_ACP_TOKEN, NO en la URL — la línea de comandos de un
#    proceso la puede leer cualquiera en la máquina; el entorno no.
GHOSTY_ACP_TOKEN=$AGENT_TOKEN \\
  npx ghosty-acp "wss://acp-$AGENT_ID.sandboxes.easybits.cloud/acp"

# C) Chat por terminal. El comando viene hecho en el campo tuiCommand al crear, pero el
#    binario hay que instalarlo antes (es Rust, NO está en npm):
#      cargo install --git https://github.com/blissito/ghosty-tui
ghosty-tui --agent $AGENT_ID --token $AGENT_TOKEN`}
            />
            <p className="text-gray-600 text-sm mb-6">
              El puerto ya está expuesto; no hace falta <code className="bg-gray-100 px-1 rounded">/expose</code>. El <code className="bg-gray-100 px-1 rounded">cwd</code> de la sesión es{" "}
              <code className="bg-gray-100 px-1 rounded">/data/work</code> — si tu cliente manda otro que no exista en la caja, se degrada a ése.
            </p>

            <h3 className="text-lg font-bold mb-3 mt-8">Duerme, despierta y revive</h3>
            <p className="text-gray-600 text-sm mb-4">
              Tras <strong>2 h sin actividad</strong> se duerme (no muere: vive hasta 30 días). El siguiente mensaje la despierta en ~1 s con su disco y su conversación intactos,
              y la URL nunca cambia. Ojo si estás conectado por WebSocket: al dormirse se te cae el socket y hay que reconectar.{" "}
              <code className="bg-gray-100 px-1 rounded">POST /api/v2/agents/:id/revive</code> es sólo para cuando el host recicló la caja tras días sin uso — tarda un boot
              (~10-60 s) y pierde el disco.
            </p>

            <h3 className="text-lg font-bold mb-3 mt-8">Otro cerebro (BYOK)</h3>
            <p className="text-gray-600 text-sm mb-4">
              El default es el cerebro medido, pero el <code className="bg-gray-100 px-1 rounded">env</code> manda. Si traes tu propia llave, el gasto va contra ese proveedor y EasyBits no lo cuenta.
            </p>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm border-2 border-black rounded-xl overflow-hidden">
                <thead className="bg-black text-white">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs uppercase">Cerebro</th>
                    <th className="text-left px-4 py-2 text-xs uppercase">env</th>
                    <th className="text-left px-4 py-2 text-xs uppercase">Consumo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-200">
                    <td className="px-4 py-2 font-mono text-xs font-bold">easybits</td>
                    <td className="px-4 py-2 font-mono text-xs">{"{}"} (default)</td>
                    <td className="px-4 py-2 text-xs">Tus tokens de EasyBits</td>
                  </tr>
                  <tr className="border-t border-gray-200">
                    <td className="px-4 py-2 font-mono text-xs font-bold">anthropic</td>
                    <td className="px-4 py-2 font-mono text-xs">GHOSTY_PROVIDER, GHOSTY_MODEL, ANTHROPIC_API_KEY</td>
                    <td className="px-4 py-2 text-xs">Tu cuenta de Anthropic. API key normal — un token OAuth (<code className="bg-gray-100 px-1 rounded">sk-ant-oat…</code>) no sirve: este proveedor autentica con <code className="bg-gray-100 px-1 rounded">x-api-key</code>.</td>
                  </tr>
                  <tr className="border-t border-gray-200">
                    <td className="px-4 py-2 font-mono text-xs font-bold">custom_deepseek</td>
                    <td className="px-4 py-2 font-mono text-xs">DEEPSEEK_API_KEY</td>
                    <td className="px-4 py-2 text-xs">Tu cuenta de DeepSeek</td>
                  </tr>
                  <tr className="border-t border-gray-200">
                    <td className="px-4 py-2 font-mono text-xs font-bold">openai · openrouter · google · ollama</td>
                    <td className="px-4 py-2 font-mono text-xs">GHOSTY_PROVIDER + su *_API_KEY</td>
                    <td className="px-4 py-2 text-xs">Tu proveedor</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 text-sm mb-6">
              <strong>Todavía no:</strong> las herramientas de EasyBits (archivos, documentos) aún no llegan al modelo en este template — el agente trae sus propias
              herramientas locales (shell, editar archivos, analizar código) y el cerebro medido. Si tu caso necesita que el agente toque tu cuenta de EasyBits, usa por ahora el template{" "}
              <code className="bg-gray-100 px-1 rounded">ghosty-gc</code>.
            </div>

            <h3 className="text-lg font-bold mb-3 mt-8">Preguntas que siempre salen</h3>
            <div className="mb-8 border-2 border-black rounded-xl overflow-hidden divide-y divide-gray-200">
              {[
                [
                  "¿De dónde sale el token de la URL wss?",
                  <>
                    Es el <code className="bg-gray-100 px-1 rounded">embedToken</code> que te devuelve el paso 1. No se genera en la caja ni cambia con el tiempo: vive con el agente.
                    <br />
                    <strong>La trampa:</strong> si al crear pasaste tu propio{" "}
                    <code className="bg-gray-100 px-1 rounded">ACP_AGENT_TOKEN</code> en el <code className="bg-gray-100 px-1 rounded">env</code>, el token es <em>ése</em> y el{" "}
                    <code className="bg-gray-100 px-1 rounded">embedToken</code> <strong>deja de servir</strong> — aunque siga apareciendo en la respuesta. Es uno o el otro, nunca los dos.
                  </>,
                ],
                [
                  "¿Hace falta el ?token= o puedo omitirlo?",
                  <>
                    Hace falta. Sin él (o con uno equivocado) el agente responde{" "}
                    <code className="bg-gray-100 px-1 rounded">401</code>, tanto en el WebSocket como por HTTP. Si tu cliente no puede poner query params, vale igual como{" "}
                    <code className="bg-gray-100 px-1 rounded">Authorization: Bearer &lt;token&gt;</code>.
                  </>,
                ],
                [
                  "Mi cliente pide un ACP_SECRET, ¿qué pongo?",
                  <>
                    El mismo token del agente. Hay un secreto interno distinto que la caja genera en cada arranque para hablar consigo misma, pero{" "}
                    <strong>nunca sale de la microVM</strong> y desde fuera no sirve para nada.
                  </>,
                ],
                [
                  "¿Y el cwd?",
                  <>
                    <code className="bg-gray-100 px-1 rounded">/data/work</code>. Es el único directorio que sobrevive a que la caja se duerma. Si tu cliente manda otro que no exista
                    dentro (típico: <code className="bg-gray-100 px-1 rounded">/root</code> o la ruta de tu Mac), el agente lo degrada a{" "}
                    <code className="bg-gray-100 px-1 rounded">/data/work</code> sin avisar.
                  </>,
                ],
                [
                  "¿Puedo usar mi llave de DeepSeek en vez del cerebro medido?",
                  <>
                    Sí: <code className="bg-gray-100 px-1 rounded">{'env: { "DEEPSEEK_API_KEY": "sk-..." }'}</code> al crear. Gana sobre el medido y el gasto va contra tu cuenta de
                    DeepSeek, no contra tus tokens de EasyBits.
                  </>,
                ],
                [
                  "¿Y el OAuth de Claude (mi suscripción Max)?",
                  <>
                    Hoy no. El proveedor <code className="bg-gray-100 px-1 rounded">anthropic</code> autentica con{" "}
                    <code className="bg-gray-100 px-1 rounded">x-api-key</code>, así que un <code className="bg-gray-100 px-1 rounded">sk-ant-oat…</code> no entra; una API key normal de
                    Anthropic sí. Estamos preparando "trae tu suscripción" como opción aparte.
                  </>,
                ],
                [
                  "Creé el agente y mi cliente no conecta",
                  <>
                    Casi siempre es una de tres: estás usando la URL del paso 1 (provisional) en vez de la del paso 2; tu llave no tiene scope{" "}
                    <strong>WRITE</strong>; o no te quedan tokens (el agente responde{" "}
                    <code className="bg-gray-100 px-1 rounded">402</code> y parece mudo). Revisa el saldo con{" "}
                    <code className="bg-gray-100 px-1 rounded">GET /api/v2/llm/balance</code>.
                  </>,
                ],
                [
                  "¿Se me borra si no lo uso?",
                  <>
                    No. Tras 2 h sin actividad se duerme, y el siguiente mensaje lo despierta con su disco y su conversación intactos. La URL nunca cambia. Si pasan días y el host
                    recicló la caja, <code className="bg-gray-100 px-1 rounded">POST /api/v2/agents/:id/revive</code> lo levanta en la misma URL (eso sí pierde el disco).
                  </>,
                ],
              ].map(([q, a], i) => (
                <div key={i} className="p-4">
                  <p className="font-bold text-sm mb-1">{q}</p>
                  <p className="text-gray-600 text-sm">{a}</p>
                </div>
              ))}
            </div>

            <h3 className="text-lg font-bold mb-3">Herramientas MCP</h3>
            <div className="mb-6">
              {[
                ["agent_create", "template: \"ghosty-lite\", env", "Crear el agente (mismo flujo que el POST)"],
                ["agent_message", "agentId, content", "Un turno; devuelve { content, tokens, usage? }"],
                ["agent_list", "—", "Listar tus agentes"],
                ["agent_destroy", "agentId", "Destruir la caja"],
              ].map(([name, params, desc]) => (
                <McpTool key={name} name={name} params={params} description={desc} />
              ))}
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

            <div className="mb-6 bg-purple-50 border-2 border-purple-300 rounded-xl p-4 text-sm">
              ¿Construyes sobre EasyBits? Crea y configura agentes por código con el{" "}
              <a href="#sdk" className="underline font-medium">SDK</a> (<code className="bg-gray-100 px-1 rounded">{`eb.fleet.create({ engine, name, systemPrompt })`}</code>, <code className="bg-gray-100 px-1 rounded">eb.fleet.setModel</code>, <code className="bg-gray-100 px-1 rounded">setAgentPrompt</code>, <code className="bg-gray-100 px-1 rounded">setToolGroup</code>…) o la REST <code className="bg-gray-100 px-1 rounded">/api/v2/fleet-agents</code>. Motores: Claude, DeepSeek, Codex. Así es como <strong>Formmy</strong> configura sus agentes en tu flota.
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

          {/* Agentes en tu app — canal web (HTTP) + configuración por código */}
          <section id="agentes-en-tu-app" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Agentes en tu app</h2>
            <p className="text-gray-600 mb-4 text-sm">
              La <a href="#flota" className="underline font-medium">Flota</a> no es sólo WhatsApp. El mismo agente atiende <strong>tu aplicación</strong> por HTTP: le mandas un mensaje, te devuelve la respuesta. No hay nada que registrar — ni grupo, ni número, ni alta previa. Y lo que configuras aquí (prompt, tools, tus propios MCP) es lo mismo que ve el agente en cualquier otro canal.
            </p>

            <div className="mb-6 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 text-sm">
              <strong>El token del agente es de servidor.</strong> Autoriza TODO lo de esta página, incluido reconfigurarlo y borrarlo. Llama a estos endpoints desde tu backend y proxea la respuesta a tu front — nunca lo pongas en el browser.
              <br /><br />
              Si lo que quieres es un chat <strong>dentro de tu app</strong>, no uses este token: emite una{" "}
              <a href="#credenciales-flota" className="underline font-medium">credencial con alcance</a>{" "}
              y, para el navegador, un token de sesión. Así lo que viaja al cliente sólo puede mandar mensajes.
            </div>

            <h3 className="text-lg font-bold mb-3">1. Hablarle</h3>
            <p className="text-gray-600 mb-3 text-sm">
              Dos formas, mismo motor: <code className="bg-gray-100 px-1 rounded">/message</code> devuelve la respuesta completa en JSON; <code className="bg-gray-100 px-1 rounded">/message-stream</code> la manda por SSE (<code className="bg-gray-100 px-1 rounded">chunk</code> conforme se escribe, y un <code className="bg-gray-100 px-1 rounded">done</code> final cuyo <code className="bg-gray-100 px-1 rounded">value</code> es la respuesta autoritativa — arma el mensaje con ése, no concatenando los chunks). También puede llegar <code className="bg-gray-100 px-1 rounded">capacity</code>: tu flota está llena en ese instante. No es un fallo del turno — reintenta pasado su <code className="bg-gray-100 px-1 rounded">retryAfter</code>.
            </p>
            <p className="text-gray-600 mb-3 text-sm">
              El <code className="bg-gray-100 px-1 rounded">groupId</code> es <strong>opaco</strong>: identifica una conversación y lo eliges tú. Un <code className="bg-gray-100 px-1 rounded">web-&lt;uuid&gt;</code> por usuario, o el id de tu propia tabla de chats. Mismo <code className="bg-gray-100 px-1 rounded">groupId</code> = misma memoria; uno nuevo = conversación nueva.
            </p>
            <TabbedCode
              tabs={[
                {
                  label: "SDK",
                  code: `import { EasybitsClient } from "@easybits.cloud/sdk";

const eb = new EasybitsClient({ apiKey: process.env.EASYBITS_API_KEY });

// Los métodos de fleet se autentican con el TOKEN DEL AGENTE, no con tu API key.
const { reply } = await eb.fleet.message(AGENT_ID, AGENT_TOKEN, {
  groupId: "web-8f2c1a",     // tu id de conversación
  configGroupId: "mi-app",   // la unidad de CONFIG (ver abajo)
  text: "¿Cuánto cuesta el plan Pro?",
  timezone: "America/Mexico_City",
  // Contexto de ESTE turno, sin tocar la config del agente:
  appendSystemPrompt: \`El usuario es \${user.name}, plan \${user.plan}.\`,
});`,
                },
                {
                  label: "cURL",
                  code: `curl -X POST https://www.easybits.cloud/api/v2/fleet-agents/$AGENT_ID/message \\
  -H "Authorization: Bearer $AGENT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "groupId": "web-8f2c1a",
    "configGroupId": "mi-app",
    "text": "¿Cuánto cuesta el plan Pro?"
  }'
# → { "reply": "El plan Pro cuesta…" }`,
                },
                {
                  label: "Streaming (fetch)",
                  code: `// El SDK ya lo cubre con eb.fleet.messageStream(); esto es el equivalente crudo.
const res = await fetch(
  \`https://www.easybits.cloud/api/v2/fleet-agents/\${AGENT_ID}/message-stream\`,
  {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${AGENT_TOKEN}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ groupId, configGroupId: "mi-app", text }),
  }
);

// SSE: chunk* → done
for await (const evt of readSse(res.body)) {
  if (evt.event === "chunk") process.stdout.write(evt.data);
  if (evt.event === "done") return JSON.parse(evt.data).value;
}`,
                },
              ]}
            />
            <div className="mb-6" />

            <div className="mb-6 bg-red-50 border-2 border-red-300 rounded-xl p-4 text-sm">
              <strong>Manda siempre <code className="bg-white px-1 rounded">configGroupId</code>.</strong> Es la unidad de <strong>configuración</strong> (prompt, tools, MCPs); el <code className="bg-white px-1 rounded">groupId</code> sólo identifica la conversación. Si lo omites, cada conversación busca una config con su propio id, no la encuentra, y el agente arranca <strong>sin tus conectores</strong> — se ve idéntico a un MCP roto ("no tengo esa herramienta"). Usa un valor estable para toda tu app (<code className="bg-white px-1 rounded">"mi-app"</code>) y configura ESE.
              <br /><br />
              Los MCP se montan al <strong>crear la sesión</strong>, no en cada turno: para comprobar un cambio de configuración, prueba con un <code className="bg-white px-1 rounded">groupId</code> nuevo.
            </div>

            <h3 id="credenciales-flota" className="text-lg font-bold mb-3">2. Credenciales con alcance</h3>
            <p className="text-gray-600 mb-3 text-sm">
              El token del agente sirve para <em>todo</em>: mandar mensajes, cambiar el prompt, leer
              secretos y borrar el agente. Eso está bien para tu backend, pero no para repartirlo entre
              integraciones — y mucho menos para el navegador. Emite credenciales que hagan una sola cosa.
            </p>

            <div className="mb-4 overflow-x-auto">
              <table className="w-full text-sm border-2 border-black rounded-xl overflow-hidden">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left px-3 py-2 border-b-2 border-black">Scope</th>
                    <th className="text-left px-3 py-2 border-b-2 border-black">Puede</th>
                    <th className="text-left px-3 py-2 border-b-2 border-black">No puede</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  <tr className="border-b border-gray-200">
                    <td className="px-3 py-2 font-mono text-xs">MESSAGE</td>
                    <td className="px-3 py-2">Mandar turnos (<code className="text-xs">/message</code>, <code className="text-xs">/message-stream</code>).</td>
                    <td className="px-3 py-2 text-gray-500">Nada de configuración.</td>
                  </tr>
                  <tr className="border-b border-gray-200">
                    <td className="px-3 py-2 font-mono text-xs">MANAGE</td>
                    <td className="px-3 py-2">Todo lo anterior + leer y ajustar config: prompt, modelo, effort, canales, capacidades.</td>
                    <td className="px-3 py-2 text-gray-500">Secretos, MCPs, skills, motor, borrar.</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-mono text-xs">ADMIN</td>
                    <td className="px-3 py-2">Todo, incluidos <code className="text-xs">set-secret</code>, <code className="text-xs">add-mcp</code>, <code className="text-xs">set-engine</code> y borrar el agente.</td>
                    <td className="px-3 py-2 text-gray-500">—</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mb-4 bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-sm">
              <strong>Dos prefijos, dos posturas.</strong>{" "}
              <code className="bg-white px-1 rounded">flt_sk_</code> es secreta: cualquier scope, sólo
              por header, y <strong>se rechaza si la mandas por query string</strong> (ahí acabaría en
              logs de acceso y en el Referer).{" "}
              <code className="bg-white px-1 rounded">flt_pk_</code> es publishable: sólo{" "}
              <code className="bg-white px-1 rounded">MESSAGE</code>, admitida en el navegador y acotada
              por <code className="bg-white px-1 rounded">allowedOrigins</code>.
              <br /><br />
              El valor completo se muestra <strong>una sola vez</strong>, al crearla. Después sólo verás
              su prefijo. También puedes emitirlas y revocarlas desde{" "}
              <a href="/dash/flota" className="underline font-medium">/dash/flota</a>.
            </div>

            <TabbedCode
              tabs={[
                {
                  label: "Emitir",
                  code: `# Con el token del agente (o una credencial ADMIN).
curl -X POST https://www.easybits.cloud/api/v2/fleet-agents/$AGENT_ID/tokens \\
  -H "Authorization: Bearer $AGENT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "backend del CRM", "scopes": ["MESSAGE"] }'
# → { "token": { "id": "...", "prefix": "flt_sk_a1b2c3d", "raw": "flt_sk_..." } }
#   \`raw\` no se vuelve a mostrar: guárdalo ahora.

# Listar (sin valores) y revocar:
curl  https://www.easybits.cloud/api/v2/fleet-agents/$AGENT_ID/tokens -H "Authorization: Bearer $AGENT_TOKEN"
curl -X DELETE https://www.easybits.cloud/api/v2/fleet-agents/$AGENT_ID/tokens \\
  -H "Authorization: Bearer $AGENT_TOKEN" -H "Content-Type: application/json" \\
  -d '{ "tokenId": "..." }'`,
                },
                {
                  label: "Token de sesión",
                  code: `// EN TU SERVIDOR. Nunca mandes un flt_sk_ al navegador.
const r = await fetch(
  \`https://www.easybits.cloud/api/v2/fleet-agents/\${AGENT_ID}/session-token\`,
  {
    method: "POST",
    headers: { Authorization: \`Bearer \${MI_FLT_SK}\`, "Content-Type": "application/json" },
    body: JSON.stringify({
      cfgId: "crm:acme",                        // ata la sesión a ESTE cliente
      ttlMin: 15,
      allowedOrigins: ["https://app.micrm.com"],
    }),
  }
);
const { token, expiresAt } = await r.json();   // flt_pk_…, caduca solo
// → mándale \`token\` al navegador.`,
                },
              ]}
            />
            <div className="mb-4" />

            <div className="mb-6 bg-green-50 border-2 border-green-300 rounded-xl p-4 text-sm">
              <strong>Por qué <code className="bg-white px-1 rounded">cfgId</code> importa en el token de sesión.</strong>{" "}
              Un token que lo lleva <strong>ignora</strong> el <code className="bg-white px-1 rounded">configGroupId</code>{" "}
              que mande el cliente. Sin eso, una sesión emitida para un cliente podría pedir la
              configuración de otro simplemente cambiando un campo del body.
            </div>

            <h3 className="text-lg font-bold mb-3">3. Embeberlo</h3>

            <TabbedCode
              tabs={[
                {
                  label: "Widget embebido",
                  code: `// EN TU SERVIDOR — el navegador nunca ve la llave durable.
const { token } = await eb.fleet.sessionToken(agentId, MI_FLT_SK, {
  cfgId: "crm:acme",           // ata la sesión a ESTE cliente
  ttlMin: 15,
  allowedOrigins: ["https://app.micrm.com"],
});
// → mándale \`token\` al cliente.

// EN EL NAVEGADOR — con streaming, para que se vea escribir.
const reply = await eb.fleet.messageStream(agentId, token, {
  groupId: "web-" + crypto.randomUUID(),
  configGroupId: "crm:acme",   // sin esto el agente arranca sin conectores
  text: "¿Cuánto debe la cuenta 4471?",
}, {
  onChunk: (t) => render(t),
  onCapacity: ({ retryAfter }) => avisar(\`saturado, reintento en \${retryAfter}s\`),
});`,
                },
              ]}
            />
            <div className="mb-6" />

            <h3 className="text-lg font-bold mb-3">4. Configurarlo</h3>
            <p className="text-gray-600 mb-3 text-sm">
              Todo pasa por <code className="bg-gray-100 px-1 rounded">/api/v2/fleet-agents/:id/capabilities</code>. El dashboard de EasyBits es sólo un cliente de este endpoint: lo que puedes hacer con la UI, lo puedes hacer por API. <code className="bg-gray-100 px-1 rounded">GET</code> devuelve el catálogo y el estado actual; <code className="bg-gray-100 px-1 rounded">POST</code> aplica <strong>una</strong> mutación con <code className="bg-gray-100 px-1 rounded">action</code>.
            </p>

            <div className="mb-4 overflow-x-auto">
              <table className="w-full text-sm border-2 border-black rounded-xl overflow-hidden">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left px-3 py-2 border-b-2 border-black">action (REST)</th>
                    <th className="text-left px-3 py-2 border-b-2 border-black">SDK</th>
                    <th className="text-left px-3 py-2 border-b-2 border-black">Qué hace</th>
                    <th className="text-left px-3 py-2 border-b-2 border-black">Alcance</th>
                    <th className="text-left px-3 py-2 border-b-2 border-black">Scope mín.</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">set-agent-prompt</td><td className="px-3 py-2 font-mono text-xs text-gray-500">setAgentPrompt</td><td className="px-3 py-2">El prompt base: quién es el agente.</td><td className="px-3 py-2">Todo el agente</td><td className="px-3 py-2 font-mono text-xs">MANAGE</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">set-model</td><td className="px-3 py-2 font-mono text-xs text-gray-500">setModel</td><td className="px-3 py-2">Modelo del motor.</td><td className="px-3 py-2">Todo el agente</td><td className="px-3 py-2 font-mono text-xs">MANAGE</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">set-effort</td><td className="px-3 py-2 font-mono text-xs text-gray-500">setEffort</td><td className="px-3 py-2">Cuánto piensa: <code>low</code> · <code>medium</code> · <code>high</code> · <code>xhigh</code>.</td><td className="px-3 py-2">Todo el agente</td><td className="px-3 py-2 font-mono text-xs">MANAGE</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">add-mcp</td><td className="px-3 py-2 font-mono text-xs text-gray-500">addMcp</td><td className="px-3 py-2">Conecta <strong>tu</strong> API como MCP: <code>url</code> (Streamable-HTTP, el secret viaja como <code>Authorization: Bearer</code>) o <code>pkg</code> (npm, stdio, como env var). Sólo lo registra: enciéndelo con <code>set-cap-level</code>.</td><td className="px-3 py-2">Todo el agente</td><td className="px-3 py-2 font-mono text-xs">ADMIN</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">remove-mcp</td><td className="px-3 py-2 font-mono text-xs text-gray-500">removeMcp</td><td className="px-3 py-2">Lo quita del catálogo.</td><td className="px-3 py-2">Todo el agente</td><td className="px-3 py-2 font-mono text-xs">ADMIN</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">recycle-box</td><td className="px-3 py-2 font-mono text-xs text-gray-500">recycleBox</td><td className="px-3 py-2">Recicla las cajas del agente: el siguiente turno arranca una nueva con env fresco (motor, modelo, llave del motor). Respalda las conversaciones antes; no corta turnos en vuelo.</td><td className="px-3 py-2">Todo el agente</td><td className="px-3 py-2 font-mono text-xs">ADMIN</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">set-engine</td><td className="px-3 py-2 font-mono text-xs text-gray-500">setEngine</td><td className="px-3 py-2">Cambia el motor (Claude, DeepSeek, Codex…). Recicla las cajas solo.</td><td className="px-3 py-2">Todo el agente</td><td className="px-3 py-2 font-mono text-xs">ADMIN</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">set-name</td><td className="px-3 py-2 font-mono text-xs text-gray-500">setName</td><td className="px-3 py-2">Nombre del agente.</td><td className="px-3 py-2">Todo el agente</td><td className="px-3 py-2 font-mono text-xs">MANAGE</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">toggle-own-number</td><td className="px-3 py-2 font-mono text-xs text-gray-500">toggleOwnNumber</td><td className="px-3 py-2">Número dedicado: sin prefijo <code>Nombre:</code> en WhatsApp.</td><td className="px-3 py-2">Todo el agente</td><td className="px-3 py-2 font-mono text-xs">MANAGE</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">add-skill · toggle-skill · delete-skill</td><td className="px-3 py-2 font-mono text-xs text-gray-500">addSkill · toggleSkill · deleteSkill</td><td className="px-3 py-2">Skills (SKILL.md + scripts subidos a Files como <code>fileIds</code>).</td><td className="px-3 py-2">Todo el agente</td><td className="px-3 py-2 font-mono text-xs">MANAGE<span className="text-gray-500"> · ADMIN para add-skill · delete-skill</span></td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">connect-teams</td><td className="px-3 py-2 font-mono text-xs text-gray-500">connectTeams</td><td className="px-3 py-2">Marca el canal Teams como conectado.</td><td className="px-3 py-2">Todo el agente</td><td className="px-3 py-2 font-mono text-xs">MANAGE</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">toggle-asset</td><td className="px-3 py-2 font-mono text-xs text-gray-500">toggleAsset</td><td className="px-3 py-2">Archivo del owner adjunto como contexto del canal.</td><td className="px-3 py-2">Por canal</td><td className="px-3 py-2 font-mono text-xs">MANAGE</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">set-db-allow</td><td className="px-3 py-2 font-mono text-xs text-gray-500">setDbAllow</td><td className="px-3 py-2">Namespaces de DB que el agente puede tocar (<code>[]</code> = todas).</td><td className="px-3 py-2">Por canal</td><td className="px-3 py-2 font-mono text-xs">MANAGE</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">set-secret</td><td className="px-3 py-2 font-mono text-xs text-gray-500">setSecret</td><td className="px-3 py-2">Guarda la credencial que usa un MCP (cifrada, no se vuelve a leer).</td><td className="px-3 py-2">Todo el agente</td><td className="px-3 py-2 font-mono text-xs">ADMIN</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">set-prompt</td><td className="px-3 py-2 font-mono text-xs text-gray-500">setGroupPrompt</td><td className="px-3 py-2">Prompt que se <strong>suma</strong> al base, sólo en este canal.</td><td className="px-3 py-2">Por canal</td><td className="px-3 py-2 font-mono text-xs">MANAGE</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">set-toolgroup</td><td className="px-3 py-2 font-mono text-xs text-gray-500">setToolGroup</td><td className="px-3 py-2">Qué tools de EasyBits ve: <code>buckets</code> (imágenes, documentos, investigación…).</td><td className="px-3 py-2">Por canal</td><td className="px-3 py-2 font-mono text-xs">MANAGE</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">set-cap-level</td><td className="px-3 py-2 font-mono text-xs text-gray-500">setCapLevel</td><td className="px-3 py-2">Nivel de una capacidad: <code>off</code> · <code>read</code> · <code>write</code>.</td><td className="px-3 py-2">Por canal</td><td className="px-3 py-2 font-mono text-xs">MANAGE</td></tr>
                  <tr className="border-b border-gray-200"><td className="px-3 py-2 font-mono text-xs">set-tool-deny</td><td className="px-3 py-2 font-mono text-xs text-gray-500">setToolDeny</td><td className="px-3 py-2">Prohíbe una tool concreta.</td><td className="px-3 py-2">Por canal</td><td className="px-3 py-2 font-mono text-xs">MANAGE</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-xs">toggle-builtin</td><td className="px-3 py-2 font-mono text-xs text-gray-500">toggleBuiltin</td><td className="px-3 py-2">Prende/apaga un conector incluido.</td><td className="px-3 py-2">Por canal</td><td className="px-3 py-2 font-mono text-xs">MANAGE</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-gray-500 mb-4 text-xs">
              Las acciones "por canal" llevan <code className="bg-gray-100 px-1 rounded">groupId</code> — y ahí va tu <code className="bg-gray-100 px-1 rounded">configGroupId</code>, el mismo que mandas al hablarle.
              <br />
              Las marcadas <code className="bg-gray-100 px-1 rounded">ADMIN</code> pueden sacar una credencial del vault, meter un servidor ajeno en el turno o destruir trabajo — por eso una credencial <code className="bg-gray-100 px-1 rounded">MANAGE</code> no las alcanza.
            </p>

            <TabbedCode
              tabs={[
                {
                  label: "SDK",
                  code: `const eb = new EasybitsClient({ apiKey: process.env.EASYBITS_API_KEY });
const a = [AGENT_ID, AGENT_TOKEN] as const;

// Quién es (todos los canales)
await eb.fleet.setAgentPrompt(...a, "Eres el asistente de Acme…");

// Tu API como herramienta del agente
await eb.fleet.setSecret(...a, { name: "ACME_API_KEY", value: process.env.ACME_API_KEY });
await eb.fleet.addMcp(...a, {
  name: "acme",
  label: "Acme",
  url: "https://api.acme.com/mcp",
  requiredSecret: "ACME_API_KEY",   // http → Authorization: Bearer <secret>, resuelto por turno
});
// add-mcp sólo lo registra: ENCIÉNDELO ("*" = todos los canales)
await eb.fleet.setCapLevel(...a, "*", { cap: "acme", level: "write" });

// Qué puede hacer EN TU APP (canal "mi-app")
await eb.fleet.setToolGroup(...a, "mi-app", { buckets: ["imagenes", "documentos"] });
await eb.fleet.setGroupPrompt(...a, "mi-app", "Aquí hablas con clientes finales: no menciones precios internos.");`,
                },
                {
                  label: "REST",
                  code: `const cfg = async (body) =>
  fetch(\`https://www.easybits.cloud/api/v2/fleet-agents/\${AGENT_ID}/capabilities\`, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${AGENT_TOKEN}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).then((r) => r.json());

// Quién es (todos los canales)
await cfg({ action: "set-agent-prompt", systemPrompt: "Eres el asistente de Acme…" });

// Tu API como herramienta del agente
await cfg({ action: "set-secret", name: "ACME_API_KEY", value: process.env.ACME_API_KEY });
await cfg({
  action: "add-mcp",
  name: "acme",
  label: "Acme",
  url: "https://api.acme.com/mcp",
  requiredSecret: "ACME_API_KEY", // http → Authorization: Bearer <secret>
});
// add-mcp sólo lo registra: ENCIÉNDELO ("*" = todos los canales)
await cfg({ action: "set-cap-level", groupId: "*", cap: "acme", level: "write" });

// Qué puede hacer EN TU APP (canal "mi-app")
await cfg({ action: "set-toolgroup", groupId: "mi-app", buckets: ["imagenes", "documentos"] });
await cfg({ action: "set-prompt", groupId: "mi-app", systemPrompt: "Aquí hablas con clientes finales: no menciones precios internos." });`,
                },
              ]}
            />
            <p className="text-gray-600 mb-6 text-sm">
              Las mismas acciones existen por MCP: <code className="bg-gray-100 px-1 rounded">fleet_agent_list</code> → <code className="bg-gray-100 px-1 rounded">fleet_agent_capabilities</code> → <code className="bg-gray-100 px-1 rounded">fleet_agent_configure {`{ fleetAgentId, action, params }`}</code>, autenticadas con tu API key (no con el token del agente), en el grupo <code className="bg-gray-100 px-1 rounded">fleet</code> del conector (<code className="bg-gray-100 px-1 rounded">?tools=fleet</code>). Para borrar un agente: <code className="bg-gray-100 px-1 rounded">POST /api/v2/fleet-agents/:id/delete</code>.
            </p>

            <h3 className="text-lg font-bold mb-3">Tres capas de prompt</h3>
            <p className="text-gray-600 mb-3 text-sm">
              Se <strong>suman</strong>, nunca se pisan. De más estable a más volátil:
            </p>
            <ol className="list-decimal list-inside text-sm text-gray-600 mb-6 space-y-1">
              <li><strong>Base del agente</strong> — <code className="bg-gray-100 px-1 rounded">set-agent-prompt</code>. Quién es, en todos los canales.</li>
              <li><strong>Del canal</strong> — <code className="bg-gray-100 px-1 rounded">set-prompt</code> con <code className="bg-gray-100 px-1 rounded">groupId</code>. Cómo se comporta en tu app.</li>
              <li><strong>Del turno</strong> — <code className="bg-gray-100 px-1 rounded">appendSystemPrompt</code> en el propio mensaje. Quién pregunta, qué plan tiene, qué está viendo. Sin escribir nada en la config.</li>
            </ol>
            <div className="mb-6 bg-gray-50 border-2 border-gray-300 rounded-xl p-4 text-sm text-gray-600">
              La capa 1 se hornea al <strong>arrancar la caja</strong> del agente: cambiarla aplica a conversaciones nuevas, no a una que ya está viva. Las capas 2 y 3 son inmediatas. Para contexto que cambia por usuario o por pantalla, usa la 3.
            </div>

            <div className="bg-gray-50 border-2 border-gray-300 rounded-xl p-4 text-sm text-gray-600">
              <strong>Por MCP todavía no.</strong> Toda esta superficie existe en SDK y REST, pero aún no hay herramientas MCP para crear o configurar un agente de la flota — las <code className="bg-white px-1 rounded">agent_*</code> que verás en <a href="#agents" className="underline font-medium">Agentes &amp; Sandboxes</a> son de sandboxes, otra cosa. Un agente todavía no puede configurar a otro agente.
              <br /><br />
              Los métodos del SDK viven en <a href="#sdk" className="underline font-medium">SDK</a> (<code className="bg-white px-1 rounded">eb.fleet.*</code>); para crear el agente y sacar su token, <a href="#flota" className="underline font-medium">Flota</a>.
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
              Precios MXN/mes, NVMe, sin cobro de tráfico. Disco add-on: <strong>+100GB NVMe = $99/mes</strong> (apilable). CPU <strong>reserved</strong> (piso garantizado por cgroup) solo desde <code className="bg-gray-100 px-1 rounded">focus</code>. Para correr una app 24/7 (migrar desde Fly/Render) empieza en <code className="bg-gray-100 px-1 rounded">micro</code>; <code className="bg-gray-100 px-1 rounded">nano</code> (256MB) da para un binario estático o un side-project, no para un build de Node.
            </p>

            <h3 className="text-lg font-bold mb-3">Tu app en producción en una sola llamada</h3>
            <p className="text-gray-600 text-sm mb-3">
              <code className="bg-gray-100 px-1 rounded">launch_app</code> es el <code className="bg-gray-100 px-1 rounded">fly launch</code> de EasyBits: provisiona la máquina, mete el código, lo buildea, lo arranca, te da una URL HTTPS pública, <strong>publica el release de recuperación</strong> y, si le pasas un dominio, lo conecta con TLS. Te devuelve <code className="bg-gray-100 px-1 rounded">{`{ url, releaseId, domain.dns }`}</code>.
            </p>
            <p className="text-gray-600 text-sm mb-3">
              El código puede venir de <strong>tres lados</strong>: <code className="bg-gray-100 px-1 rounded">repo</code> (git clone), <code className="bg-gray-100 px-1 rounded">archiveUrl</code> (un .tar.gz o .zip subido desde tu compu, por si aún no tienes repo), o <code className="bg-gray-100 px-1 rounded">sandboxId</code> (ya escribiste la app dentro de una caja). Si el build falla, la máquina que creó se libera sola — no te quedas pagando una caja rota.
            </p>
            <TabbedCode
              tabs={[
                { label: "SDK", code: `const app = await eb.machines.launch({
  repo: "https://github.com/cliente/tienda",   // o archiveUrl, o sandboxId
  tier: "micro",
  port: 3000,
  dataPaths: ["data", "uploads"],              // sin esto NO hay backup
  domain: "tienda.com",
});
app.url          // ya sirve por HTTPS
app.domain?.dns  // el registro EXACTO que tu cliente debe crear en su DNS
app.releaseId    // ya es recuperable

// ¿Sin repo? Sube la carpeta desde tu compu:
// tar czf app.tar.gz -C ./mi-tienda .
const up = await eb.uploadFile({ name: "app.tar.gz", access: "private" });
await fetch(up.uploadUrl, { method: "PUT", body: fs.readFileSync("app.tar.gz") });
await eb.machines.launch({ archiveUrl: up.url, domain: "tienda.com" });` },
                { label: "REST", code: `POST /api/v2/machines/launch
{
  "repo": "https://github.com/cliente/tienda",
  "tier": "micro",
  "port": 3000,
  "dataPaths": ["data"],
  "domain": "tienda.com"
}
# → { sandboxId, url, releaseId, domain: { dns: { type, name, value } } }

# Sin repo, desde un archivo subido:
{ "archiveUrl": "https://…/app.tar.gz", "domain": "tienda.com" }` },
                { label: "MCP", code: `launch_app({
  repo: "https://github.com/cliente/tienda",  // o archiveUrl / sandboxId
  tier: "micro", port: 3000,
  dataPaths: ["data"],
  domain: "tienda.com",
})
// → { url, releaseId, domain: { dns } }` },
              ]}
            />

            <p className="text-gray-600 text-sm mb-6">
              <strong>Tiempos medidos</strong> con una app React Router v7 real (204 MB de <code className="bg-gray-100 px-1 rounded">node_modules</code>, release de 49.5 MB) en tier <code className="bg-gray-100 px-1 rounded">micro</code>: provisionar la caja <strong>3.7 s</strong> · <code className="bg-gray-100 px-1 rounded">npm ci</code> + build en la caja <strong>6.9 s</strong> · publicar el release <strong>11.3 s</strong> · <strong>redeploy a una caja limpia 12.0 s</strong>. Con <code className="bg-gray-100 px-1 rounded">prebuilt: true</code> el deploy no ejecuta build: baja, extrae y arranca. ⚠️ Buildea <em>dentro</em> de la caja, no en tu Mac: un <code className="bg-gray-100 px-1 rounded">node_modules</code> con módulos nativos compilado en macOS revienta en Linux.
            </p>

            <h3 className="text-lg font-bold mb-3 mt-8">Configurar la app: variables y arranque</h3>
            <p className="text-gray-600 text-sm mb-3">
              Defaults: <code className="bg-gray-100 px-1 rounded">template: "node"</code> (Node 22 + npm; <code className="bg-gray-100 px-1 rounded">ubuntu</code> <strong>no</strong> trae Node), <code className="bg-gray-100 px-1 rounded">appDir: "/app"</code>, <code className="bg-gray-100 px-1 rounded">port: 3000</code>, build <code className="bg-gray-100 px-1 rounded">npm ci && npm run build</code>, arranque <code className="bg-gray-100 px-1 rounded">npm start</code>. Las variables <strong>no secretas</strong> (PORT, URLs, ids) van en <code className="bg-gray-100 px-1 rounded">env</code>: se exportan antes del build y del arranque, y los secretos de la bóveda ganan por nombre.
            </p>
            <TabbedCode
              tabs={[
                { label: "REST", code: `# 1. Secretos a la bóveda de la máquina (una vez)
PUT /api/v2/machines/:sandboxId/secrets
{ "ACP_SECRET": "...", "EASYBITS_API_KEY": "eb_sk_..." }

# 2. Redesplegar la MISMA máquina desde el repo (release nuevo, ~18 s)
POST /api/v2/machines/launch
{ "sandboxId": "sb_...",
  "repo": "https://github.com/usuario/mi-app",
  "buildCommand": "npm ci && npm run build",
  "startCommand": "node server.js",
  "port": 4000,
  "env": { "PORT": "4000", "ACP_WS_URL": "wss://..." } }` },
                { label: "MCP", code: `set_machine_secrets({ sandboxId, secrets: { ACP_SECRET: "..." } })
launch_app({ sandboxId, repo: "https://github.com/usuario/mi-app",
             startCommand: "node server.js", port: 4000,
             env: { PORT: "4000" } })` },
              ]}
            />
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-sm mt-3 mb-6">
              Aprendido con una app real (React Router v7 + Express 5): <code className="bg-gray-100 px-1 rounded">npm start</code> con <code className="bg-gray-100 px-1 rounded">node --env-file=.env</code> <strong>muere en la caja</strong> porque no hay <code className="bg-gray-100 px-1 rounded">.env</code> — arranca con <code className="bg-gray-100 px-1 rounded">node server.js</code> y pasa la config por <code className="bg-gray-100 px-1 rounded">env</code> + secretos. Express 5 rechaza <code className="bg-gray-100 px-1 rounded">app.all("*")</code>: usa <code className="bg-gray-100 px-1 rounded">app.use(handler)</code>. Los repos públicos de GitHub clonan sin token.
            </div>

            <h3 className="text-lg font-bold mb-3 mt-8">Hosting sin plan: la máquina se paga sola</h3>
            <p className="text-gray-600 text-sm mb-3">
              <strong>No necesitas plan de pago para hostear.</strong> Una máquina se factura con su propia suscripción, así que desde una cuenta Free pagas tu caja y nada más. El plan sigue siendo el gate de IA, storage y flota — dejó de serlo para hosting.
            </p>
            <p className="text-gray-600 text-sm mb-3">
              <code className="bg-gray-100 px-1 rounded">create_machine</code> devuelve una de dos cosas: <strong>con plan</strong>, la máquina lista y cobrada en la misma factura; <strong>sin plan</strong>, un <code className="bg-gray-100 px-1 rounded">checkoutUrl</code> que le pasas al cliente. La máquina <strong>se crea sola en cuanto el pago se confirma</strong> — nada corre gratis mientras tanto. Cancelar la máquina no toca tu plan, y cancelar tu plan no se lleva la máquina.
            </p>
            <TabbedCode
              tabs={[
                { label: "SDK", code: `const r = await eb.machines.buy({ tier: "micro" });
if (r.checkoutUrl) {
  // Cuenta sin plan: mándale el link. La caja nace cuando pague.
  console.log("Paga aquí:", r.checkoutUrl);
} else {
  console.log("Lista:", r.sandboxId);
}` },
                { label: "REST", code: `POST /api/v2/machines
{ "tier": "micro" }

# Con plan  → { sandboxId, tier, monthlyMxn, status, ... }
# Sin plan  → { checkoutUrl, tier, monthlyMxn }` },
                { label: "MCP", code: `create_machine({ tier: "micro" })
// Con plan → la máquina.
// Sin plan → { checkoutUrl }. Pásaselo al cliente y, cuando pague,
// aparece en list_machines().` },
              ]}
            />

            <h3 className="text-lg font-bold mb-3 mt-8">Crear un sandbox permanente</h3>
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
release_machine({ sandboxId, confirm: true })  // quita cobro + destruye la VM YA` },
              ]}
            />

            <h3 className="text-lg font-bold mb-3 mt-8">Releases: que tu caja sea reconstruible</h3>
            <p className="text-gray-600 text-sm mb-3">
              Fly y Vercel pueden tratar el disco como desechable porque cada deploy lo reconstruye desde una imagen. Aquí la app se escribe <em>dentro</em> de la caja, así que si la caja muere no pierdes solo los datos — pierdes la app. Un <strong>release</strong> lo resuelve: un tarball versionado de tu código en almacenamiento durable, más un <strong>runspec</strong> que dice cómo construirlo y arrancarlo. Con los dos, cualquier caja se reconstruye — y eso es también como se <strong>cambia de tier</strong> (no hay resize en caliente: se recrea).
            </p>
            <p className="text-gray-600 text-sm mb-3">
              Un release guarda <strong>código, no datos</strong>. Una caja recreada arranca vacía; los datos los cubre el backup.
            </p>
            <TabbedCode
              tabs={[
                { label: "SDK", code: `// 1. Declara cómo se construye y arranca tu app
await eb.machines.setRunspec(sandboxId, {
  appDir: "/app",
  buildCommand: "npm ci && npm run build",
  unit: "myapp",            // o startCommand
  port: 3000,
  dataPaths: ["data", "uploads"],  // esto es lo que respalda el backup diario
});

// 2. Publica el código actual como release
const rel = await eb.machines.deploy(sandboxId, { message: "v1" });

// 3a. ¿Deploy malo? Vuelve al anterior, misma caja
await eb.machines.rollback(sandboxId, releaseAnterior);

// 3b. ¿Caja muerta, o quieres otro tier? Recrea desde el release
const fresh = await eb.machines.redeploy(rel.releaseId, {
  tier: "mini",                    // así se hace un "resize"
  replaceSandboxId: sandboxId,     // libera la vieja al confirmar la nueva
});                                // sin esto pagas las dos` },
                { label: "REST", code: `# Runspec
GET /api/v2/machines/:id/runspec
PUT /api/v2/machines/:id/runspec
{ "appDir": "/app", "buildCommand": "npm ci && npm run build", "dataPaths": ["data"] }

# Publicar / listar releases
POST /api/v2/machines/:id/releases   { "message": "v1" }
GET  /api/v2/machines/:id/releases

# Rollback (misma caja)
POST /api/v2/machines/:id/rollback   { "releaseId": "rel_..." }   # sin rebuild: el release lleva su build
GET  /api/v2/machines/:id/logs?lines=200&grep=   # el log de LA APP (unit o startCommand)

# Recrear en una caja nueva (recuperación o cambio de tier).
# Colección aparte a propósito: funciona aunque la máquina original ya no exista.
POST /api/v2/machine-releases/:releaseId/redeploy
{ "tier": "mini", "replaceSandboxId": "sb_abc123" }` },
                { label: "MCP", code: `set_machine_runspec({ sandboxId, appDir: "/app", buildCommand: "npm ci && npm run build", dataPaths: ["data"] })
deploy_machine({ sandboxId, message: "v1" })   // publica release
list_machine_releases({ sandboxId })
rollback_machine({ sandboxId, releaseId })     // misma caja
redeploy_machine({ releaseId, tier: "mini", replaceSandboxId })  // caja nueva / resize` },
              ]}
            />

            <h3 className="text-lg font-bold mb-3 mt-8">Backups: incluidos, 7 días</h3>
            <p className="text-gray-600 text-sm mb-3">
              Cada noche copiamos los <code className="bg-gray-100 px-1 rounded">dataPaths</code> de tu runspec a almacenamiento durable <strong>fuera del host</strong>, con 7 días de retención y <strong>sin costo extra</strong>. No respaldamos el sistema operativo: eso se reconstruye del template, igual que Fly respalda volúmenes y no el rootfs. Al borrar una máquina tomamos una copia final y la guardamos <strong>7 días</strong>: borrar destruye la VM en el acto, así que ese respaldo es la única vuelta atrás.
            </p>
            <p className="text-gray-600 text-sm mb-3">
              Dos cosas dichas de frente: el RPO es de <strong>24 horas</strong>, y el backup se toma del filesystem en caliente, así que una base de datos escribiendo durante la copia puede quedar inconsistente — cada backup reporta su nivel en el campo <code className="bg-gray-100 px-1 rounded">consistency</code>. Si tu app tiene una DB, tenla fuera de la caja (libSQL de EasyBits, Atlas) o toma un <code className="bg-gray-100 px-1 rounded">create_backup</code> tras detenerla.
            </p>
            <TabbedCode
              tabs={[
                { label: "SDK", code: `// Backups diarios automáticos; este es bajo demanda
const bk = await eb.machines.backup(sandboxId);   // antes de algo riesgoso
const { items } = await eb.machines.backups(sandboxId);
console.log(items[0].stamp, items[0].bytes, items[0].consistency);` },
                { label: "REST", code: `GET  /api/v2/machines/:id/backups   # 7 días, más reciente primero
POST /api/v2/machines/:id/backups   # tomar uno ahora` },
                { label: "MCP", code: `list_backups({ sandboxId })
create_backup({ sandboxId })       // antes de algo riesgoso
// Restaurar SOBREESCRIBE datos → exige confirm:true.
// Restaurar sobre la caja origen toma un backup previo automático.
restore_machine_from_backup({ backupId, confirm: true })
restore_machine_from_backup({ backupId, targetSandboxId, confirm: true })  // a una caja nueva` },
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

            <h3 className="text-lg font-bold mb-3 mt-10">Variables secretas de tu app</h3>
            <p className="text-gray-600 text-sm mb-3">
              Tu app necesita su <code className="bg-gray-100 px-1 rounded">DATABASE_URL</code>, su <code className="bg-gray-100 px-1 rounded">STRIPE_SECRET_KEY</code>. <strong>No las metas en <code className="bg-gray-100 px-1 rounded">runspec.env</code></strong>: eso se guarda en la base y viaja dentro de cada tarball de release. La API las rechaza por nombre.
            </p>
            <p className="text-gray-600 text-sm mb-3">
              Los valores se guardan cifrados en tu bóveda y en el runspec queda solo la <strong>lista de nombres</strong>. Se materializan dentro de la máquina —en un archivo que solo root puede leer— justo antes de construir y de arrancar. No entran al release: una caja reconstruida desde un tarball sigue sin llevarlos dentro, pero sabe cuáles pedir.
            </p>
            <TabbedCode
              tabs={[
                { label: "SDK", code: `await eb.machines.setSecrets(sandboxId, {
  DATABASE_URL: "mongodb+srv://...",
  JWT_SECRET: "...",
});

await eb.machines.secrets(sandboxId);      // { secretNames, inVault }
await eb.machines.unsetSecret(sandboxId, "DATABASE_URL");` },
                { label: "REST", code: `PUT /api/v2/machines/:sandboxId/secrets
{ "DATABASE_URL": "mongodb+srv://...", "JWT_SECRET": "..." }

GET    /api/v2/machines/:id/secrets            # nombres, nunca valores
DELETE /api/v2/machines/:id/secrets?name=DATABASE_URL` },
                { label: "MCP", code: `set_machine_secrets({ sandboxId, secrets: { DATABASE_URL: "..." } })
list_machine_secrets({ sandboxId })
unset_machine_secret({ sandboxId, name: "DATABASE_URL" })

// OJO: secret_set a secas SOLO guarda el valor en la bóveda de la
// cuenta. Para que la máquina lo reciba hace falta enlazarlo a su
// runspec — eso es lo que hace set_machine_secrets.` },
              ]}
            />
            <p className="text-gray-600 text-sm mt-3 mb-6">
              Surten efecto en el <strong>siguiente despliegue</strong>, no al vuelo: rotar un secreto es cambiarlo aquí y volver a desplegar. Si el runspec declara uno que no está en la bóveda, el deploy falla diciendo cuál — mejor que ver la app morir al conectar. También se administran en <code className="bg-gray-100 px-1 rounded">/dash/hosting</code> → pestaña Variables.
            </p>

            <h3 className="text-lg font-bold mb-3 mt-10">Desplegar desde GitHub en cada push</h3>
            <p className="text-gray-600 text-sm mb-3">
              El patrón recomendado para el sitio de un cliente: <strong>construir en el runner de GitHub</strong> y mandarle a la máquina el resultado ya hecho. La caja no compila nada, así que un sitio que necesitaría 4 GB para bundlear cabe en <code className="bg-gray-100 px-1 rounded">micro</code>.
            </p>
            <TabbedCode
              tabs={[
                { label: "CLI", code: `npx @easybits.cloud/cli init

# Escribe el workflow y el script de deploy en tu repo, y te dice
# los tres pasos que quedan fuera: crear la máquina, guardar los
# secretos del repo y cargar las variables de la app.` },
                { label: "REST", code: `# 1. Una vez: crear la máquina
POST /api/v2/machines/launch
{ "repo": "https://github.com/usuario/repo.git", "branch": "main",
  "tier": "micro", "template": "node", "appDir": "/srv/app", "port": 3000 }

# 2. En cada push, desde el runner: subes el build y despliegas
POST /api/v2/files            { "fileName": "...", "access": "public", ... }
POST /api/v2/machines/launch  { "sandboxId": "sb_...", "archiveUrl": "...",
                                "prebuilt": true, "appDir": "/srv/app" }` },
              ]}
            />
            <p className="text-gray-600 text-sm mt-3">
              Por qué <code className="bg-gray-100 px-1 rounded">sandboxId</code> <strong>y</strong> <code className="bg-gray-100 px-1 rounded">archiveUrl</code> juntos: <code className="bg-gray-100 px-1 rounded">sandboxId</code> es el <strong>destino</strong>, no una fuente. Puedes mandar un artefacto ya construido a una máquina que ya existe — sin eso, el único sitio donde podría ocurrir el build sería dentro de la caja del cliente.
            </p>
            <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4 text-sm mt-4">
              El runner de GitHub es Linux x64, igual que la microVM, así que los módulos nativos compilan para el destino correcto. <strong>Construir en una Mac sí rompe</strong>: un <code className="bg-gray-100 px-1 rounded">node_modules</code> con sharp o better-sqlite3 compilado en macOS revienta en Linux. Cada despliegue publica un release, así que historial y rollback siguen funcionando igual.
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
          {/* LLM proxy OpenAI-compatible */}
          <section id="llm" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">LLM (OpenAI-compatible)</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Un gateway OpenAI-compatible con tu misma llave de EasyBits. No necesitas cuenta con el proveedor ni otra API key: apuntas cualquier cliente OpenAI a nuestra base URL y el consumo se descuenta de tu saldo de tokens.
            </p>

            <div className="mb-6 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 text-sm">
              <strong>La base URL lleva prefijo <code className="bg-gray-100 px-1 rounded">/api/v2/llm</code>.</strong> Pegarle a <code className="bg-gray-100 px-1 rounded">/v1/chat/completions</code> o <code className="bg-gray-100 px-1 rounded">/chat/completions</code> a secas devuelve <code className="bg-gray-100 px-1 rounded">404</code> — es el error más común al configurar un cliente.
            </div>

            <h3 className="text-lg font-bold mb-3">Base URL</h3>
            <TabbedCode
              tabs={[
                { label: "curl", code: `curl -X POST https://www.easybits.cloud/api/v2/llm/v1/chat/completions \\
  -H "Authorization: Bearer eb_sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role":"user","content":"Hola"}]
  }'` },
                { label: "OpenAI SDK", code: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "eb_sk_live_...",                                  // tu llave de EasyBits
  baseURL: "https://www.easybits.cloud/api/v2/llm/v1",       // ← el prefijo importa
});

const res = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: [{ role: "user", content: "Hola" }],
});
console.log(res.choices[0].message.content);` },
                { label: "Python", code: `from openai import OpenAI

client = OpenAI(
    api_key="eb_sk_live_...",
    base_url="https://www.easybits.cloud/api/v2/llm/v1",
)

res = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "Hola"}],
)
print(res.choices[0].message.content)` },
              ]}
            />

            <h3 className="text-lg font-bold mt-8 mb-3">Endpoints</h3>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm border-2 border-black rounded-xl overflow-hidden">
                <thead className="bg-black text-white">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs uppercase">Método &amp; ruta</th>
                    <th className="text-left px-4 py-2 text-xs uppercase">Qué hace</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["POST", "/api/v2/llm/v1/chat/completions", "Completions. Soporta stream: true (SSE)"],
                    ["GET", "/api/v2/llm/v1/models", "Modelos disponibles (proxy al proveedor, caché 5 min)"],
                    ["GET", "/api/v2/llm/balance", "Saldo: usado, restante, plan, recargas, fecha de reset"],
                    ["POST", "/api/v2/llm/recharge", "Compra tokens extra"],
                  ].map(([method, path, desc], i) => (
                    <tr key={path as string} className={i % 2 ? "border-t border-gray-200 bg-gray-50" : "border-t border-gray-200"}>
                      <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                        <span className="font-bold">{method}</span> {path}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="text-lg font-bold mt-8 mb-3">Notas</h3>
            <ul className="list-disc pl-5 text-sm text-gray-600 space-y-2 mb-4">
              <li>
                <strong>Modelos</strong>: no hardcodeamos la lista — pégale a <code className="bg-gray-100 px-1 rounded">/models</code>. Si omites <code className="bg-gray-100 px-1 rounded">model</code>, el default es <code className="bg-gray-100 px-1 rounded">deepseek-chat</code>.
              </li>
              <li>
                <strong>La llave necesita scope <code className="bg-gray-100 px-1 rounded">WRITE</code></strong>: gastar tokens no es una operación de lectura. Una llave de solo lectura recibe <code className="bg-gray-100 px-1 rounded">403 permission_error</code>.
              </li>
              <li>
                <strong>Se cobra <code className="bg-gray-100 px-1 rounded">prompt_tokens + completion_tokens</code></strong> de cada respuesta contra tu saldo. Sin saldo: <code className="bg-gray-100 px-1 rounded">402 insufficient_quota</code>, con <code className="bg-gray-100 px-1 rounded">used</code> y <code className="bg-gray-100 px-1 rounded">limit</code> en <code className="bg-gray-100 px-1 rounded">meta</code>.
              </li>
              <li>
                <strong>Headers de respuesta</strong>: <code className="bg-gray-100 px-1 rounded">x-llm-tokens-remaining</code> y <code className="bg-gray-100 px-1 rounded">x-ratelimit-remaining-requests</code> — úsalos para no tener que pedir el balance en cada llamada.
              </li>
              <li>
                <strong>CORS abierto</strong>, pero eso no hace segura una llave en el browser: <code className="bg-gray-100 px-1 rounded">eb_sk_live_...</code> es secreta y gasta tu saldo. Llama desde tu servidor.
              </li>
              <li>
                <strong>Contextos largos cuestan</strong>: cada turno reenvía el historial completo y se cobra íntegro. Una conversación de 300K tokens paga 300K <em>por turno</em>. Compacta o recorta.
              </li>
            </ul>
          </section>

          <section id="calls" className="mb-16">
            <h2 className="text-2xl font-bold mb-4">Llamadas</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Salas de videollamada con <strong>grabación en HD</strong>, self-hosted (template <code className="bg-gray-100 px-1 rounded">livekit-svc</code>). Tu agente crea la sala, los participantes se unen <strong>desde el navegador</strong> (cámara + pantalla compartida, sin instalar nada), y el servidor graba el layout completo en 1080p. Al terminar, el MP4 se sube a tus <a href="#files" className="underline font-medium">Archivos</a>. Sin servidores de terceros, sin límite de duración.
            </p>

            <div className="mb-6 bg-green-50 border-2 border-green-300 rounded-xl p-4 text-sm">
              <strong>7 herramientas MCP</strong> en el grupo <code className="bg-gray-100 px-1 rounded">sandbox</code>:{" "}
              <code className="bg-gray-100 px-1 rounded">call_create</code>, <code className="bg-gray-100 px-1 rounded">call_record</code>, <code className="bg-gray-100 px-1 rounded">call_stop</code>, <code className="bg-gray-100 px-1 rounded">call_status</code>, <code className="bg-gray-100 px-1 rounded">call_files</code>, <code className="bg-gray-100 px-1 rounded">call_transcript</code>, <code className="bg-gray-100 px-1 rounded">call_destroy</code>.{" "}
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

            <h3 className="text-lg font-bold mb-3 mt-8">Transcript de la llamada</h3>
            <p className="text-gray-600 text-sm mb-3">
              Al detener la grabación, la caja transcribe el audio con <strong>Whisper embebido</strong> (español, on-device — sin proveedor externo) y sube el <code className="bg-gray-100 px-1 rounded">.txt</code> a tus <a href="#files" className="underline font-medium">Archivos</a>. <code className="bg-gray-100 px-1 rounded">transcript</code> devuelve el <strong>texto inline</strong> (no un link) más un <code className="bg-gray-100 px-1 rounded">status</code>: <code className="bg-gray-100 px-1 rounded">transcribing</code> (Whisper procesando, reintenta en ~1 min), <code className="bg-gray-100 px-1 rounded">ready</code> (texto en <code className="bg-gray-100 px-1 rounded">text</code>), <code className="bg-gray-100 px-1 rounded">failed</code>, <code className="bg-gray-100 px-1 rounded">unavailable</code> o <code className="bg-gray-100 px-1 rounded">no_recording</code>. Con <code className="bg-gray-100 px-1 rounded">sandboxId</code> = estado en vivo del box; sin él = el transcript más reciente de Archivos.
            </p>
            <TabbedCode
              tabs={[
                { label: "SDK", code: `// Estado en vivo durante/tras la llamada
const t = await eb.calls.transcript(call.sandboxId);
if (t.status === "transcribing") {
  // Whisper aún procesando — reintenta en ~1 min
} else if (t.status === "ready") {
  console.log(t.text); // texto completo, listo para resumir
}

// El transcript más reciente de tus Archivos (sin sandboxId)
const last = await eb.calls.transcript();` },
                { label: "REST", code: `# Estado en vivo (el box es la fuente de verdad)
GET  /api/v2/calls/:id/transcript
# → { source, status, text, chars }

# El más reciente de tus Archivos
GET  /api/v2/calls/transcript
# → { source: "files", status: "ready", text, fileId }` },
                { label: "MCP", code: `call_transcript({ sandboxId })   // estado en vivo → { status, text }
call_transcript()                // el transcript más reciente de Archivos` },
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
                    ["fleet", "3", "Agentes de la flota: listar, leer config y aplicar acciones de /capabilities"],
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
                { label: "Ghosty Code", code: `npm install -g ghostycode
ghosty auth set --provider easybits --api-key "TU_EASYBITS_API_KEY"
ghosty mcp add easybits --url "https://www.easybits.cloud/api/mcp/all"
ghosty mcp login easybits
ghosty --yolo` },
                { label: "Claude Code", code: `# Core + sandboxes + documents
claude mcp add --transport http easybits "https://www.easybits.cloud/api/mcp/sandbox,docs"

# Todo
claude mcp add --transport http easybits "https://www.easybits.cloud/api/mcp/all"` },
                { label: "Streamable HTTP", code: `// El toolset va en el path
https://www.easybits.cloud/api/mcp/sandbox,docs
https://www.easybits.cloud/api/mcp/all` },
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
  // Sin estas tres, un bloque titulado "bash" caía al default `typescript` y la etiqueta de la
  // tarjeta decía TYPESCRIPT encima de un comando de shell.
  bash: "bash",
  sh: "bash",
  shell: "bash",
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
  const [copied, setCopied] = useState(false);
  // CodeBlock trae botón de copiar, pero sólo en su modo con header propio; aquí se usa
  // `bare` porque el header lo pone esta tarjeta, así que el botón hay que ponerlo también.
  // Sin él, un doc lleno de comandos obliga a seleccionar a mano y a copiar de más.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* sin portapapeles (http, permisos): el texto sigue siendo seleccionable */
    }
  };
  return (
    <div className="border-2 border-black rounded-xl overflow-hidden">
      <div className="flex items-center justify-between bg-gray-800 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium text-sm">{title}</span>
          <span className="text-gray-400 text-xs uppercase font-mono">{lang}</span>
        </div>
        <button
          onClick={copy}
          title="Copiar"
          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded border border-gray-600 transition-colors"
        >
          {copied ? "¡Copiado!" : "Copiar"}
        </button>
      </div>
      <CodeBlock bare language={lang}>
        {code}
      </CodeBlock>
    </div>
  );
}

/** Respuesta de una llamada. Va en su propia tarjeta y SIN botón: nadie copia una respuesta,
 *  y mezclarla con la petición hace que quien copia se lleve el JSON pegado al comando. */
function ResponseExample({ code }: { code: string }) {
  return (
    <div className="border-2 border-gray-300 rounded-xl overflow-hidden mb-6">
      <div className="bg-gray-100 px-4 py-2 text-xs uppercase font-mono text-gray-500 tracking-wide">
        Respuesta
      </div>
      <CodeBlock bare language="json">
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