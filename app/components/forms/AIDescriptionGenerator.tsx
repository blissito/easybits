import React, { useRef, useState, useEffect } from "react";
import { useExcelToText } from "~/hooks/useXLSX";
import { cn } from "~/utils/cn";
import { FaFileExcel } from "react-icons/fa";
import { IoClose } from "react-icons/io5";

interface AIDescriptionGeneratorProps {
  assetTitle: string;
  currentContent?: string | null;
  onGenerate: (content: string) => void;
  className?: string;
}

export const AIDescriptionGenerator: React.FC<AIDescriptionGeneratorProps> = ({
  assetTitle,
  currentContent,
  onGenerate,
  className = "",
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<string>("");
  const [showExcelUploader, setShowExcelUploader] = useState(true);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  // Excel handling
  const {
    file,
    output: excelContext,
    excelData,
    handleFileChange,
    handleFileDrop,
    isLoading: excelLoading,
    error: excelError,
    clearData,
    isSupportedFile,
  } = useExcelToText();

  const handleGenerateDescription = async () => {
    if (isLoading && abortController) {
      abortController.abort();
    }
    setIsLoading(true);
    const controller = new AbortController();
    setAbortController(controller);

    // save and reset the input
    const promptText = `${inputRef.current!.value}`;
    setLastPrompt(promptText);
    inputRef.current!.value = "";

    // Construir el contexto del Excel si existe
    const excelContextText = excelContext
      ? `\n\nCONTEXTO DEL ARCHIVO EXCEL:\n${excelContext}\n\n`
      : "";

    const chat = [
      {
        role: "system",
        content: `Descripción actual: ${String(
          currentContent ?? "(vacía)"
        )}, toma en cuenta el titulo del asset que es: ${assetTitle}.${excelContextText}Refina la descripción para el asset según las instrucciones del usuario. Para los títulos usa siempre # o ## y para los subtitulos usa: ###. Usa algunas citas relacionadas también y siempre, quiero decir, siempre, response en español mexicano y no añadas ni tus comentarios ni instrucciones. Devuelve siempre: markdown directamente, sin el bloque de markdown`,
      },
      {
        role: "user",
        content: promptText,
      },
    ];

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
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) return;

        let buffer = "";
        let generatedContent = "";

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
                  generatedContent += data.response;
                  // Notificar progreso en tiempo real
                  onGenerate(generatedContent);
                }
              } catch (e) {
                console.warn("Línea JSON no válida:", line);
              }
            }
          }
        }
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error al generar la descripción:", error);
    } finally {
      setAbortController(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileDrop(files);
    }
  };

  return (
    <div
      className={cn(
        "bg-brand-50 border border-brand-200 rounded-xl p-4",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-brand-700 flex items-center gap-2">
          <svg
            width="24"
            height="24"
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
          Generador de Descripción con IA
        </h3>
        <button
          type="button"
          onClick={() => setShowExcelUploader(!showExcelUploader)}
          className="text-sm text-brand-600 hover:text-brand-700 font-medium underline flex items-center gap-1"
        >
          <FaFileExcel className="text-xs" />
          {showExcelUploader ? "Ocultar" : "Agregar"} Excel
        </button>
      </div>

      {/* Excel Uploader Section */}
      {showExcelUploader && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <FaFileExcel className="text-brand-500" />
            <span className="text-sm font-medium text-gray-700">
              Contexto de Excel (opcional)
            </span>
          </div>

          {/* Excel Upload Area */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-4 text-center transition-colors",
              {
                "border-brand-300 bg-brand-50": !file,
                "border-brand-500 bg-brand-100": file,
              }
            )}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {!file ? (
              <div>
                <FaFileExcel className="mx-auto text-3xl text-brand-400 mb-2" />
                <p className="text-sm text-gray-600 mb-2">
                  Arrastra un archivo Excel aquí o haz clic para seleccionar
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                  id="excel-upload"
                />
                <label
                  htmlFor="excel-upload"
                  className="inline-flex items-center px-3 py-1 bg-brand-500 text-white text-sm rounded-md hover:bg-brand-600 cursor-pointer transition-colors"
                >
                  Seleccionar archivo
                </label>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FaFileExcel className="text-brand-500" />
                  <span className="text-sm font-medium text-gray-700">
                    {file.name}
                  </span>
                  {excelLoading && (
                    <div className="flex items-center gap-1 text-xs text-brand-600">
                      <div className="w-3 h-3 border border-brand-300 border-t-brand-600 rounded-full animate-spin"></div>
                      Procesando...
                    </div>
                  )}
                </div>
                <button
                  onClick={clearData}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <IoClose className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Excel Context Display */}
          {excelContext && (
            <div className="mt-3 bg-white border border-brand-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-brand-700 font-medium flex items-center gap-2">
                  <FaFileExcel className="text-xs text-brand-500" />✓{" "}
                  {file?.name} cargado como contexto
                </span>
              </div>
              <div className="text-xs text-gray-600 max-h-32 overflow-y-auto bg-gray-50 border border-gray-200 rounded p-2 font-mono">
                <pre className="whitespace-pre-wrap text-xs">
                  {excelContext}
                </pre>
              </div>
            </div>
          )}

          {excelError && (
            <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              Error: {excelError}
            </div>
          )}
        </div>
      )}

      {/* AI Instructions */}
      <div className="mb-4 p-3 bg-white border border-brand-200 rounded-lg">
        <div className="text-sm text-brand-600">
          <p className="mb-2">
            Describe tu asset de forma <strong>clara y atractiva</strong>.
          </p>
          {excelContext && (
            <p className="text-brand-700 font-medium mb-2">
              ✓ Usando datos de Excel como contexto
            </p>
          )}
          <p className="mb-2">
            Puedes pedirle generar <strong>o refinar</strong> las secciones en
            tu descripción:
          </p>
          <p className="italic text-xs mb-1">
            "Genera una descripción creativa para un libro de ilustraciones
            digitales"
          </p>
          <p className="mb-1">para después pedirle:</p>
          <p className="italic text-xs">
            "deja la sección de beneficios pero quita los bullets"
          </p>
        </div>
      </div>

      {/* Last Prompt Display */}
      {lastPrompt && (
        <div className="mb-3 flex items-center gap-2 bg-brand-100 border border-brand-200 rounded-lg px-3 py-2 text-xs text-brand-700 font-medium">
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
          <span className="italic">Último mensaje:</span>
          <span className="ml-1 text-brand-600 font-normal">{lastPrompt}</span>
        </div>
      )}

      {/* Prompt Input */}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleGenerateDescription();
            }
          }}
          className="flex-1 rounded-lg border border-brand-500/30 bg-white px-3 py-2 text-sm text-brand-500 placeholder-brand-500/60 focus:ring-2 focus:ring-brand-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="Escribe aquí tu prompt para la IA..."
          aria-label="Prompt para IA"
        />
        <button
          onClick={
            isLoading
              ? () => abortController?.abort()
              : handleGenerateDescription
          }
          type="button"
          className={cn(
            "inline-flex items-center justify-center hover:bg-brand-700 text-white rounded-lg p-2 transition-colors bg-brand-500",
            {
              "bg-white": isLoading,
            }
          )}
          title="Enviar a IA"
        >
          {isLoading ? (
            <img className="w-6" src="/thinking_bot.gif" alt="thinking robot" />
          ) : (
            <svg width="20" height="20" fill="none" viewBox="0 0 20 20">
              <path
                d="M10 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z"
                fill="currentColor"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};
