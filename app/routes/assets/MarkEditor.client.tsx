import MDEditor from "@uiw/react-md-editor";
import { useEffect, useRef, useState } from "react";
import { AIDescriptionGenerator } from "~/components/forms/AIDescriptionGenerator";

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

      {/* AI Description Generator */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">
            Generador de Descripción con IA
          </h4>
          <button
            type="button"
            onClick={() => setShowAISuggestion(!showAISuggestion)}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium underline"
          >
            {showAISuggestion ? "Ocultar" : "Mostrar"} generador
          </button>
        </div>

        {showAISuggestion && (
          <AIDescriptionGenerator
            assetTitle={assetTitle}
            currentContent={content}
            onGenerate={handleAIGeneration}
            className="mb-4"
          />
        )}
      </div>

      {/* Markdown Editor */}
      <div ref={editorRef}>
        <MDEditor
          preview="edit"
          value={content || ""}
          onChange={handleChange}
          height={500}
          className="border border-gray-300 rounded-lg"
        />
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}
    </section>
  );
};
