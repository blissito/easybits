// El PRIMER bloque que ve quien llega a /docs (y al setup del panel): pedirle a su agente que
// instale los skills de EasyBits. Un comando + la llave + un primer prompt copiable con una
// acción real (no "hola"). Sin dependencias del servidor: es copy + clipboard.
import { useState } from "react";

export const SKILLS_ADD_CMD = "npx skills add https://easybits.cloud";
export const SKILLS_ENV_CMD = 'export EASYBITS_API_KEY="eb_sk_live_…"';
export const FIRST_PROMPT =
  "Instala los skills de easybits.cloud. Luego crea un sandbox `node` que sobreviva (suspendOnIdle), corre `node -v` adentro y dime el resultado con el sandboxId.";

function CopyBlock({ text, label, mono = true }: { text: string; label?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className="relative rounded-xl border-2 border-black bg-black text-white p-4 pr-24">
      {label && <div className="text-[10px] uppercase tracking-wide text-white/60 mb-1">{label}</div>}
      <pre className={`${mono ? "font-mono" : ""} text-xs sm:text-sm whitespace-pre-wrap break-words m-0`}>{text}</pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-3 right-3 rounded-lg border border-white/40 px-2 py-1 text-[11px] font-semibold hover:bg-white hover:text-black transition-colors"
      >
        {copied ? "✓ Copiado" : "Copiar"}
      </button>
    </div>
  );
}

export function SkillsInstall({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-2xl border-2 border-black bg-brand-500/10 p-5 shadow-[6px_6px_0_0_#000]">
      <h2 className={`${compact ? "text-lg" : "text-2xl"} font-black mb-1`}>Pídele a tu agente que descubra EasyBits</h2>
      <p className="text-sm text-gray-700 mb-4">
        No copies URLs: tu agente de código (Claude Code, Cursor, Codex, Ghosty Code) instala los skills
        y aprende solo cómo usar sandboxes, web, archivos, bases de datos y hosting.
      </p>
      <div className="space-y-3">
        <CopyBlock label="1. En tu terminal" text={`${SKILLS_ADD_CMD}\n${SKILLS_ENV_CMD}`} />
        <CopyBlock label="2. Luego pídele, por ejemplo" text={FIRST_PROMPT} mono={false} />
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Tu API key se crea en el{" "}
        <a href="/dash/developer" className="underline font-medium">Dashboard de Desarrollador</a>. Los skills
        se publican en{" "}
        <a href="/.well-known/skills/index.json" className="underline font-mono">/.well-known/skills</a> y
        cada sección de estos docs existe como markdown en <span className="font-mono">/docs/&lt;sección&gt;.md</span>.
      </p>
    </div>
  );
}
