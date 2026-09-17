// Acciones «agent-first» de la sección activa de /docs: copiar su markdown, abrirla en Claude
// o ChatGPT con un prompt que apunta al `.md`, y copiar la config del MCP de docs.
// Nada de esto toca el servidor: el `.md` ya existe en /docs/<sección>.md.
import { useState } from "react";

const SITE = "https://www.easybits.cloud";
export const DOCS_MCP_URL = `${SITE}/mcp/docs`;

export function PageActions({ section }: { section: string }) {
  const mdUrl = `${SITE}/docs/${section}.md`;
  const q = encodeURIComponent(`Lee ${mdUrl} y ayúdame a aplicarlo en mi proyecto.`);
  const [state, setState] = useState<"" | "md" | "mcp">("");
  const flash = (k: "md" | "mcp") => {
    setState(k);
    window.setTimeout(() => setState(""), 1500);
  };
  const copyMd = async () => {
    try {
      const res = await fetch(`/docs/${section}.md`);
      await navigator.clipboard.writeText(await res.text());
      flash("md");
    } catch {}
  };
  const copyMcp = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ mcpServers: { "easybits-docs": { type: "http", url: DOCS_MCP_URL } } }, null, 2)
      );
      flash("mcp");
    } catch {}
  };
  const btn =
    "inline-flex h-8 items-center gap-1.5 rounded-full border-2 border-black bg-white px-3 text-xs font-semibold hover:bg-brand-500 hover:text-white transition-colors";
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-gray-500 font-mono">/docs/{section}.md</span>
      <button type="button" onClick={copyMd} className={btn}>
        {state === "md" ? "✓ Copiado" : "Copiar markdown"}
      </button>
      <a href={`https://claude.ai/new?q=${q}`} target="_blank" rel="noreferrer" className={btn}>
        Abrir en Claude ↗
      </a>
      <a href={`https://chatgpt.com/?q=${q}`} target="_blank" rel="noreferrer" className={btn}>
        Abrir en ChatGPT ↗
      </a>
      <button
        type="button"
        onClick={copyMcp}
        title="Copia la config del MCP de la documentación (Claude Code, Cursor, Codex)"
        className={btn}
      >
        {state === "mcp" ? "✓ Config copiada" : "MCP de docs"}
      </button>
    </div>
  );
}
