import MDEditor from "@uiw/react-md-editor";
import { useState } from "react";

// Editor de prompts (client-only) — CodeMirror + preview markdown en vivo, lo que
// usa la comunidad. Reemplaza el textarea plano del editor de Instrucciones: alto,
// resaltado de sintaxis, y toggle Editar/Dividido/Preview + fullscreen del propio
// MDEditor. El valor se sincroniza a un <input hidden name={name}> para que el form
// (fetcher.Form set-agent-prompt) lo envíe sin cambios al submit.
export function PromptEditor({
  name,
  defaultValue,
  onDirty,
}: {
  name: string;
  defaultValue: string;
  onDirty?: () => void;
}) {
  const [val, setVal] = useState(defaultValue || "");
  const [mode, setMode] = useState<"edit" | "live" | "preview">("live");
  return (
    <div data-color-mode="light" className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-1 mb-2 text-[11px] font-semibold">
        {(["edit", "live", "preview"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-2 py-1 rounded-lg border-2 ${mode === m ? "border-black bg-black text-white" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
          >
            {m === "edit" ? "Editar" : m === "live" ? "Dividido" : "Preview"}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-gray-400 font-normal">{val.length.toLocaleString()} caracteres · Markdown</span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden rounded-lg border-2 border-gray-200">
        <MDEditor
          value={val}
          onChange={(v) => {
            setVal(v || "");
            onDirty?.();
          }}
          preview={mode}
          height="100%"
          visibleDragbar={false}
          textareaProps={{ placeholder: "Personalidad, reglas, catálogo, tono…" }}
        />
      </div>
      <input type="hidden" name={name} value={val} />
    </div>
  );
}
