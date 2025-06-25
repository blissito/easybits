import MDEditor from "@uiw/react-md-editor";
import { useEffect, useRef, useState } from "react";
import { AIDescriptionGenerator } from "~/components/forms/AIDescriptionGenerator";
import { cn } from "~/utils/cn";

export const MarkEditor = ({
  assetTitle,
  defaultValue,
  onChange,
  error,
}: {
  assetTitle: string;
  onChange?: (arg0: string) => void;
  error?: string;
  defaultValue?: string | null;
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState(defaultValue);
  const [showAISuggestion, setShowAISuggestion] = useState(true);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const lastScrollTopRef = useRef(0);

  // replace the entire content
  const handleChange = (v = "") => {
    setContent(v);
  };

  // Llamar onChange cuando cambie el contenido
  useEffect(() => {
    onChange?.(content || "");
  }, [content]);

  // Función para hacer scroll automático
  const scrollToBottom = () => {
    if (editorRef.current && autoScrollEnabled) {
      const editorContent =
        editorRef.current.querySelector(".w-md-editor-area");
      if (editorContent) {
        // Esperar al siguiente frame y luego un pequeño delay para asegurar que el DOM esté actualizado
        requestAnimationFrame(() => {
          setTimeout(() => {
            const currentScrollTop = editorContent.scrollTop;
            const scrollHeight = editorContent.scrollHeight;
            const clientHeight = editorContent.clientHeight;

            // Solo hacer auto-scroll si está cerca del final
            if (currentScrollTop + clientHeight >= scrollHeight - 50) {
              editorContent.scrollTop = editorContent.scrollHeight;
              lastScrollTopRef.current = editorContent.scrollTop;
            }
          }, 10);
        });
      }
    }
  };

  // Detectar scroll manual del usuario
  useEffect(() => {
    if (!editorRef.current) return;
    const editorContent = editorRef.current.querySelector(
      ".w-md-editor-content"
    );
    if (!editorContent) return;
    const handleScroll = () => {
      const currentScrollTop = editorContent.scrollTop;
      const scrollHeight = editorContent.scrollHeight;
      const clientHeight = editorContent.clientHeight;
      if (currentScrollTop < lastScrollTopRef.current)
        setAutoScrollEnabled(false);
      if (currentScrollTop + clientHeight >= scrollHeight - 10)
        setAutoScrollEnabled(true);
      lastScrollTopRef.current = currentScrollTop;
    };
    editorContent.addEventListener("scroll", handleScroll);
    return () => editorContent.removeEventListener("scroll", handleScroll);
  }, [showAISuggestion]);

  // Función para manejar la generación de contenido desde el componente AI
  const handleAIGeneration = (generatedContent: string) => {
    setContent(generatedContent);
    // Hacer scroll después de cada actualización del contenido
    requestAnimationFrame(scrollToBottom);
  };

  return (
    <section className="mb-3" data-color-mode="light">
      <p className="pt-3">Descripción</p>
      <p className="text-xs pb-3">Puedes usar markdown</p>

      <main className="flex gap-4 flex-col lg:flex-row">
        <section className="w-full" ref={editorRef}>
          <MDEditor
            preview="edit"
            value={content || ""}
            onChange={handleChange}
            height={500}
          />
          <input type="hidden" name="perro" value={content || ""} />
        </section>

        <article
          id="sugerencia_AI"
          className={cn("mb-4", {
            "w-28": !showAISuggestion,
          })}
        >
          <button
            type="button"
            className="w-full flex items-center justify-between gap-4 bg-brand-500/10 border border-brand-500/20 rounded-xl px-4 py-3 shadow-sm hover:shadow-md transition-all duration-200 focus:outline-none"
            onClick={() => setShowAISuggestion((v) => !v)}
            aria-expanded={showAISuggestion}
            aria-controls="ai-suggestion-content"
          >
            {/* Icono IA estilizado */}
            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-white/90 border border-brand-500/30 shadow">
              <svg
                width="28"
                height="28"
                viewBox="0 0 28 28"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <ellipse cx="14" cy="14" rx="10" ry="9" fill="#fff" />
                <path
                  d="M10.5 14c0-1.93 1.57-3.5 3.5-3.5s3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5"
                  stroke="#9870ED"
                  strokeWidth="1.5"
                />
                <rect
                  x="12.5"
                  y="12.5"
                  width="3"
                  height="3"
                  rx="1.5"
                  fill="#9870ED"
                />
                <circle cx="14" cy="14" r="0.8" fill="#fff" />
                <path
                  d="M14 7.5v1.2M14 19.3v1.2M7.5 14h1.2M19.3 14h1.2"
                  stroke="#9870ED"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            {showAISuggestion ? (
              <span className="flex-1 text-left text-brand-500 font-semibold text-base select-none">
                Sugerencia AI
              </span>
            ) : null}
            {/* Chevron animado a la derecha */}
            <svg
              width="24"
              height="24"
              fill="none"
              viewBox="0 0 24 24"
              className={`transition-transform duration-200 ${
                showAISuggestion ? "rotate-90" : ""
              }`}
            >
              <path
                d="M9 6l6 6-6 6"
                stroke="#9870ED"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <section
            id="ai-suggestion-content"
            className={`overflow-hidden transition-all duration-300 ${
              showAISuggestion ? "h-max opacity-100 mt-3" : "max-h-0 opacity-0"
            } bg-brand-500/10 border border-brand-500/20 rounded-xl p-4 shadow-sm`}
            style={{ pointerEvents: showAISuggestion ? "auto" : "none" }}
          >
            <AIDescriptionGenerator
              assetTitle={assetTitle}
              currentContent={content}
              onGenerate={handleAIGeneration}
              className="mb-0"
            />
          </section>
        </article>
      </main>

      {error && <p className="text-red-500 text-xs">{error}</p>}
    </section>
  );
};
