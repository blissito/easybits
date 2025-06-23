import MDEditor from "@uiw/react-md-editor";
import { useEffect, useRef, useState } from "react";
import { set } from "react-hook-form";
import { useFetcher } from "react-router";
import Spinner from "~/components/common/Spinner";

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
  const fetcher = useFetcher();
  const [content, setContent] = useState(defaultValue);
  const [showAISuggestion, setShowAISuggestion] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<string>("");
  const handleChange = (v = "") => {
    onChange?.(v);
    setContent(v);
  };

  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  const handleGenerateDescription = async () => {
    setIsLoading(true);
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
        )}, Titulo del asset: ${assetTitle}, Refina la descripción para el asset segun las instrucciones del usuario y devolviendo siempre markdown directamente sin el bloque de markdown y sin comentarios`,
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
      if (response.ok) {
        setContent("");
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) return;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const text = JSON.parse(chunk).response.replace(null, "");
          setContent((v) => v + text);
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

  useEffect(() => {
    onChange?.(content);
  }, [content]);

  return (
    <section className="mb-3" data-color-mode="light">
      <p className="pt-3">Descripción</p>
      <p className="text-xs pb-3">Puedes usar markdown</p>
      <div id="sugerencia_AI" className="mb-4">
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
          <span className="flex-1 text-left text-brand-500 font-semibold text-base select-none">
            Sugerencia AI
          </span>
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
        <div
          id="ai-suggestion-content"
          className={`overflow-hidden transition-all duration-300 ${
            showAISuggestion
              ? "h-[200px] opacity-100 mt-3"
              : "max-h-0 opacity-0"
          } bg-brand-500/10 border border-brand-500/20 rounded-xl p-4 shadow-sm`}
          style={{ pointerEvents: showAISuggestion ? "auto" : "none" }}
        >
          <div className="flex flex-col gap-3 h-full">
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
            {/* Input moderno para prompt AI */}
            <section className="flex items-center gap-2 mt-auto">
              <input
                disabled={isLoading}
                ref={inputRef}
                type="text"
                className="flex-1 rounded-lg border border-brand-500/30 bg-white px-3 py-2 text-sm text-brand-500 placeholder-brand-500/60 focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Escribe aquí tu prompt para la IA..."
                aria-label="Prompt para IA"
              />
              <button
                onClick={handleGenerateDescription}
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
            </section>
          </div>
        </div>
      </div>
      <MDEditor
        preview="edit"
        value={content!}
        onChange={handleChange}
        height={500}
      />
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </section>
  );
};
