import { Link } from "react-router";
import type { Route } from "./+types/mcp-page";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { Footer } from "~/components/common/Footer";
import { useState } from "react";

export const meta = () =>
  getBasicMetaTags({
    title: "Conecta EasyBits a Claude — MCP",
    description:
      "Conecta tu agente AI a EasyBits en un solo comando. 40+ herramientas MCP para gestionar archivos desde Claude, Cursor y más.",
  });

const MCP_COMMAND = "claude mcp add easybits -- npx -y @easybits.cloud/mcp";

export default function McpPage() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(MCP_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="overflow-hidden w-full min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b-2 border-black px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/inicio" className="font-bold text-xl">
            EasyBits
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/docs" className="text-sm font-medium hover:underline">
              Docs
            </Link>
            <Link to="/developers" className="text-sm font-medium hover:underline">
              Developers
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

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-xl">
          <div className="border-2 border-black rounded-xl bg-white p-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <h1 className="text-2xl md:text-3xl font-bold mb-2">
              Conecta EasyBits a Claude
            </h1>
            <p className="text-gray-600 mb-6">
              Un comando. 40+ herramientas para gestionar archivos desde tu agente AI.
            </p>

            {/* Command block */}
            <div className="border-2 border-black rounded-xl overflow-hidden mb-6">
              <div className="bg-gray-900 px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-gray-400 font-mono">terminal</span>
                <button
                  onClick={handleCopy}
                  className="text-xs text-gray-400 hover:text-white transition-colors font-medium"
                >
                  {copied ? "Copiado!" : "Copiar"}
                </button>
              </div>
              <div className="bg-gray-950 px-4 py-4">
                <code className="text-sm text-green-400 font-mono break-all">
                  {MCP_COMMAND}
                </code>
              </div>
            </div>

            {/* Links */}
            <div className="flex flex-wrap gap-4 text-sm">
              <Link to="/docs" className="font-medium underline hover:no-underline">
                Documentacion
              </Link>
              <a
                href="https://www.npmjs.com/package/@easybits.cloud/mcp"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline hover:no-underline"
              >
                npm
              </a>
              <Link to="/developers" className="font-medium underline hover:no-underline">
                API Reference
              </Link>
              <Link to="/blog" className="font-medium underline hover:no-underline">
                Blog
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {copied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 rounded-xl border-2 border-black text-sm font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,0.3)] animate-fade-in">
          Comando copiado al clipboard
        </div>
      )}

      <Footer />
    </section>
  );
}
