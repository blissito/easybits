// Acciones «agent-first» de la sección activa de /docs: copiar su markdown, abrirla en Claude
// o ChatGPT con un prompt que apunta al `.md`, y copiar la config del MCP de docs.
// Nada de esto toca el servidor: el `.md` ya existe en /docs/<sección>.md.
import { useState } from "react";

const SITE = "https://www.easybits.cloud";
export const DOCS_MCP_URL = `${SITE}/mcp/docs`;

const COPY = {
  es: { copy: "Copiar markdown", copied: "✓ Copiado", claude: "Abrir en Claude", chatgpt: "Abrir en ChatGPT", mcp: "MCP de docs", mcpCopied: "✓ Config copiada", prompt: (u: string) => `Lee ${u} y ayúdame a aplicarlo en mi proyecto.` },
  en: { copy: "Copy markdown", copied: "✓ Copied", claude: "Open in Claude", chatgpt: "Open in ChatGPT", mcp: "Docs MCP", mcpCopied: "✓ Config copied", prompt: (u: string) => `Read ${u} and help me apply it to my project.` },
} as const;

export function PageActions({ section, locale = "es" }: { section: string; locale?: "es" | "en" }) {
  const t = COPY[locale];
  const base = locale === "en" ? "/en/docs" : "/docs";
  const mdUrl = `${SITE}${base}/${section}.md`;
  const q = encodeURIComponent(t.prompt(mdUrl));
  const [state, setState] = useState<"" | "md" | "mcp">("");
  const flash = (k: "md" | "mcp") => {
    setState(k);
    window.setTimeout(() => setState(""), 1500);
  };
  const copyMd = async () => {
    try {
      const res = await fetch(`${base}/${section}.md`);
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
      <span className="text-gray-500 font-mono">{base}/{section}.md</span>
      <button type="button" onClick={copyMd} className={btn}>
        {state === "md" ? t.copied : t.copy}
      </button>
      <a href={`https://claude.ai/new?q=${q}`} target="_blank" rel="noreferrer" className={btn}>
        {t.claude} ↗
      </a>
      <a href={`https://chatgpt.com/?q=${q}`} target="_blank" rel="noreferrer" className={btn}>
        {t.chatgpt} ↗
      </a>
      <button
        type="button"
        onClick={copyMcp}
        title="Copia la config del MCP de la documentación (Claude Code, Cursor, Codex)"
        className={btn}
      >
        {state === "mcp" ? t.mcpCopied : t.mcp}
      </button>
    </div>
  );
}
