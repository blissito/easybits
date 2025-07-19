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
    <section className="mt-5 mb-3" data-color-mode="light">
      <div className="flex items-center justify-between gap-4 mb-2">
        <div >
        <p className=" -mb-1">Descripción </p>
        <span className="text-xs ">(Usa markdown )</span> 
        </div>
              <button
            type="button"
            className={cn("group w-10 h-10 border border-black flex items-center justify-center bg-brand-500/10  rounded-full  shadow-xs hover:shadow-md transition-all duration-200 focus:outline-hidden", {"": showAISuggestion})}
            onClick={() => setShowAISuggestion((v) => !v)}
            aria-expanded={showAISuggestion}
            aria-controls="ai-suggestion-content"
          >
            {/* Icono IA estilizado */}
            {!showAISuggestion ? (
             <img 
               src="/icons/ai.svg" 
               alt="AI" 
               className="w-8 h-8 ml-1 animate-pulse hover:animate-none transition-all duration-300 hover:scale-110 hover:brightness-110" 
               style={{
                 animation: 'ai-pulse 2s ease-in-out infinite',
               }}
             />
            ) : <svg
            width="24"
            height="24"
            fill="none"
            viewBox="0 0 24 24"
            className={`transition-transform duration-200 ${
              showAISuggestion ? "-rotate-90" : ""
            }`}
          >
            <path
              d="M9 6l6 6-6 6"
              stroke="#9870ED"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>}
          </button>
      </div>
      <main className={cn("flex  flex-col-reverse lg:flex-row h-fit lg:h-[544px]", {"gap-4": showAISuggestion})}>
        <section className="w-full overflow-hidden rounded-xl" ref={editorRef}>
          <MDEditor
            preview="edit"
            value={content || ""}
            onChange={handleChange}
            height={540}
          />
          <input type="hidden" name="perro" value={content || ""} />
        </section>

        <article
          id="sugerencia_AI"
        >
          <section
            id="ai-suggestion-content"
            className={`overflow-hidden transition-all duration-300 ease-in-out transform ${
              showAISuggestion 
                ? "max-h-[800px] w-full lg:w-[300px] opacity-100 scale-100 p-4" 
                : "max-h-0 w-0 opacity-0 scale-95"
            } bg-brand-500/10 border border-black rounded-xl  shadow-xs`}
            style={{ 
              pointerEvents: showAISuggestion ? "auto" : "none"
            }}
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
