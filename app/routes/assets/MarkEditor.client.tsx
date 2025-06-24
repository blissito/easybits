import MDEditor from "@uiw/react-md-editor";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import Spinner from "~/components/common/Spinner";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const fetcher = useFetcher();
  const [content, setContent] = useState(defaultValue);
  const [showAISuggestion, setShowAISuggestion] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<string>("");
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const lastScrollTopRef = useRef(0);

  const handleChange = (v = "") => {
    onChange?.(v);
    setContent(v);
  };

  // Función para hacer scroll automático
  const scrollToBottom = () => {
    if (editorRef.current && autoScrollEnabled) {
      const editorContent = editorRef.current.querySelector(
        ".w-md-editor-content"
      );
      if (editorContent) {
        // Verificar si el usuario está cerca del final antes de hacer auto-scroll
        const currentScrollTop = editorContent.scrollTop;
        const scrollHeight = editorContent.scrollHeight;
        const clientHeight = editorContent.clientHeight;

        // Solo hacer auto-scroll si está cerca del final
        if (currentScrollTop + clientHeight >= scrollHeight - 50) {
          editorContent.scrollTop = editorContent.scrollHeight;
          lastScrollTopRef.current = editorContent.scrollTop;
        }
      }
    }
  };

  // Detectar scroll manual del usuario
  useEffect(() => {
    if (!editorRef.current || !isLoading) return;

    const editorContent = editorRef.current.querySelector(
      ".w-md-editor-content"
    );
    if (!editorContent) return;

    const handleScroll = () => {
      const currentScrollTop = editorContent.scrollTop;
      const scrollHeight = editorContent.scrollHeight;
      const clientHeight = editorContent.clientHeight;

      // Si el usuario hace scroll hacia arriba (scrollTop disminuye)
      if (currentScrollTop < lastScrollTopRef.current) {
        setAutoScrollEnabled(false);
      }

      // Si el usuario hace scroll hasta el final, reactivar auto-scroll
      if (currentScrollTop + clientHeight >= scrollHeight - 10) {
        setAutoScrollEnabled(true);
      }

      lastScrollTopRef.current = currentScrollTop;
    };

    editorContent.addEventListener("scroll", handleScroll);
    return () => editorContent.removeEventListener("scroll", handleScroll);
  }, [isLoading]);

  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  const handleGenerateDescription = async () => {
    setIsLoading(true);
    setAutoScrollEnabled(true); // Reactivar auto-scroll al iniciar
    if (isLoading && abortController) {
      abortController.abort();
      setIsLoading(false);
      setAbortController(null);
      return;
    }

    const controller = new AbortController();
    setAbortController(controller);

    const promptText = `${inputRef.current!.value}`;
    setLastPrompt(promptText);
    const chat = [
      {
        role: "system",
        content: `Descripción actual: ${String(
          content ?? "(vacía)"
        )}, toma en cuenta el titulo del asset que es: ${assetTitle}. Refina la descripción para el asset según las instrucciones del usuario y devolviendo siempre markdown directamente sin el bloque de markdown y sin comentarios. Para los títulos usa siempre # o ## y para los subtitulos usa ###. Usa algunas citas relacionadas también y siempre response en español mexicano.`,
      },
      {
        role: "user",
        content: promptText,
      },
    ];

    console.log("PROMPT ENVIADO A OLLAMA:\n", chat);

    try {
      const response = await fetch("/api/v1/ai/sugestions", {
        method: "POST",
        body: new URLSearchParams({
          intent: "generate_sugestion",
          chat: JSON.stringify(chat),
        }),
        signal: controller.signal,
      });
      // @todo make this a hook
      if (response.ok) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) return;

        let buffer = "";
        setContent("");
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value);
          const lines = buffer.split("\n");

          // Mantén la última línea en el buffer por si está incompleta
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim() && line.startsWith("{")) {
              try {
                const data = JSON.parse(line);
                if (data.response) {
                  setContent((v) => v + data.response);
                  // Hacer scroll después de cada actualización del contenido
                  requestAnimationFrame(scrollToBottom);
                }
              } catch (e) {
                // Ignora errores de parsing de líneas no válidas
                console.warn("Línea JSON no válida:", line);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error al generar la descripción:", error);
    } finally {
      setIsLoading(false);
      setAbortController(null);
      inputRef.current!.value = "";
    }
  };

  // Llamar onChange cuando cambie el contenido
  useEffect(() => {
    if (content !== undefined) {
      onChange?.(content || "");
    }
  }, [content]);

  return (
    <section className="mb-3" data-color-mode="light">
      <p className="pt-3">Descripción</p>
      <p className="text-xs pb-3">Puedes usar markdown</p>
      <main className="flex gap-4 flex-col lg:flex-row">
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
              {" "}
              <path
                d="M9 6l6 6-6 6"
                stroke="#9870ED"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />{" "}
            </svg>
          </button>
          <section
            id="ai-suggestion-content"
            className={`overflow-hidden transition-all duration-300 ${
              showAISuggestion ? "h-max opacity-100 mt-3" : "max-h-0 opacity-0"
            } bg-brand-500/10 border border-brand-500/20 rounded-xl p-4 shadow-sm`}
            style={{ pointerEvents: showAISuggestion ? "auto" : "none" }}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                {/* Icono IA sin círculo */}
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
                <div className="text-sm text-brand-500">
                  Describe tu asset de forma <strong>clara y atractiva</strong>.{" "}
                  <strong>
                    Nuestro asistente AI recuerda toda la conversación.
                  </strong>
                  <br />
                  Puedes pedirle generar o refinar las secciones en tu
                  descripción:{" "}
                  <span className="italic">
                    "Genera una descripción creativa para un libro de
                    ilustraciones digitales"
                  </span>{" "}
                  <br />
                  para después pedirle:{" "}
                  <span className="italic">
                    "deja la sección de beneficios pero quita los bullets"
                  </span>
                  .
                </div>
              </div>
              {/* Contenedor animado para el último mensaje enviado */}
              <div
                className={`transition-all duration-300 overflow-hidden ${
                  lastPrompt ? "max-h-[200px] mb-2" : "max-h-0 mb-0"
                }`}
              >
                {lastPrompt && (
                  <div className="flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-2 text-xs text-brand-700 font-medium shadow-sm">
                    <svg
                      width="16"
                      height="16"
                      fill="none"
                      viewBox="0 0 20 20"
                      className="flex-shrink-0"
                    >
                      <path
                        d="M3 17l1.5-4.5M3 17l4.5-1.5M3 17l10-10a2.121 2.121 0 013 3l-10 10z"
                        stroke="#9870ED"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="italic">Último mensaje enviado:</span>
                    <span className="ml-1 text-brand-500/90 font-normal">
                      {lastPrompt}
                    </span>
                  </div>
                )}
              </div>
              <PromptInput
                inputRef={inputRef}
                isLoading={isLoading}
                onClick={handleGenerateDescription}
              />
            </div>
          </section>
        </article>
        <section className="w-full" ref={editorRef}>
          <MDEditor
            preview="edit"
            value={content || ""}
            onChange={handleChange}
            height={500}
          />
        </section>
      </main>
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </section>
  );
};

const PromptInput = ({
  inputRef,
  isLoading,
  onClick,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  isLoading: boolean;
  onClick: () => void;
}) => {
  const form = (
    <article className="flex items-center gap-2 mt-auto">
      <input
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onClick?.();
          }
        }}
        disabled={isLoading}
        ref={inputRef}
        type="text"
        className="flex-1 rounded-lg border border-brand-500/30 bg-white px-3 py-2 text-sm text-brand-500 placeholder-brand-500/60 focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        placeholder="Escribe aquí tu prompt para la IA..."
        aria-label="Prompt para IA"
      />
      <button
        onClick={onClick}
        type="button"
        className="inline-flex items-center justify-center bg-brand-500 hover:bg-brand-700 text-white rounded-lg p-2 transition-colors "
        title="Enviar a IA"
      >
        {isLoading ? (
          <Spinner className="w-4 h-4" />
        ) : (
          <svg width="20" height="20" fill="none" viewBox="0 0 20 20">
            <path
              d="M10 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z"
              fill="currentColor"
            />
          </svg>
        )}
      </button>
    </article>
  );
  // const portal = usePortal(<>{form}</>);
  return form;
};
