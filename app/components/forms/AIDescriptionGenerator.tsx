import React, { useRef, useState, useEffect } from "react";
import { useExcelToText } from "~/hooks/useXLSX";
import { cn } from "~/utils/cn";
import { FaFileExcel, FaFileWord } from "react-icons/fa";
import { IoClose } from "react-icons/io5";
import { GiMagicBroom } from "react-icons/gi";

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
    <div className={cn("", className)}>
      {/* Excel Uploader Section */}
      {showExcelUploader && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-4  " >
          <img src="/icons/ai.svg" alt="AI" className="w-5 h-5" />
            <span className="text-sm font-medium text-black">
              Bittor te ayuda a describir tu asset
            </span>
          </div>

          {/* Excel Upload Area */}
          <div
            className={cn(
              "border border-dashed border-black cursor-pointer rounded-lg p-3 text-center transition-colors grid place-content-center",
              {
                "border-brand-500 bg-brand-500/5": !file,
                "border-brand-500/50 bg-brand-500/10": file,
              }
            )}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {!file ? (
              <label  className="cursor-pointer">
                <FaFileWord className="mx-auto text-lg text-brand-500 mb-2  " />
                <p className="text-xs text-brand-500">
                  Arrastra  o selecciona un archivo (opcional)
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                  id="excel-upload"
                />
             
              </label>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FaFileExcel className="text-brand-500" />
                  <span className="text-xs font-medium text-brand-500">
                    {file.name}
                  </span>
                  {excelLoading && (
                    <div className="flex items-center gap-1 text-xs text-brand-600">
                      <div className="w-2 h-2 border border-brand-300 border-t-brand-600 rounded-full animate-spin"></div>
                      Procesando...
                    </div>
                  )}
                </div>
                <button
                  onClick={clearData}
                  className="text-brand-400 hover:text-brand-600"
                >
                  <IoClose className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Excel Context Display */}
          {excelContext && (
            <div className="mt-2 bg-white border border-brand-500/20 rounded-lg p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-brand-600 font-medium flex items-center gap-1">
                  <FaFileExcel className="text-xs text-brand-500" />✓{" "}
                  {file?.name} cargado
                </span>
              </div>
              <div className="text-xs text-brand-500/80 max-h-14 overflow-y-auto bg-brand-500/5 border border-brand-500/10 rounded p-1 font-mono">
                <pre className="whitespace-pre-wrap text-xs">
                  {excelContext}
                </pre>
              </div>
            </div>
          )}

          {excelError && (
            <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              Error: {excelError}
            </div>
          )}
        </div>
      )}
   {excelContext && (
            <p className="text-brand-600 font-medium text-xs mb-2">
              ✓ Usando datos de Excel como contexto
            </p>
          )}
      {/* AI Instructions */}
      <div className="mb-4">
        <div className="text-sm text-black">
          <p className="mb-2">
            Describe tu asset de forma <strong>clara y atractiva</strong>.   
          </p>
     
       
          <p className=" text-sm text-black mb-2">Puedes pedirle generar <strong>o refinar</strong> las secciones en
               tu descripción:</p>
          <p className="italic text-iron text-xs mb-2">
            "Genera una descripción creativa para un libro de ilustraciones
            digitales"
          </p>
          <p className="mb-2">para después pedirle:</p>
          <p className="italic text-xs text-iron mb-6">
            "deja la sección de beneficios pero quita los bullets"
          </p>
        </div>
      </div>

      {/* Last Prompt Display */}
      {lastPrompt && (
        <div className="mb-3 flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-2 text-xs text-brand-700 font-medium">
        <GiMagicBroom />

          <span className="italic">Último mensaje:</span>
          <span className="ml-1 text-brand-500/90 font-normal">
            {lastPrompt}
          </span>
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
          className="flex-1 rounded-lg border border-black bg-white px-3 py-2 text-sm text-brand-500  focus:ring-1 focus:border-brand-500 focus:ring-brand-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
            "inline-flex items-center border border-black justify-center hover:bg-brand-700 text-white rounded-lg h-10 w-10 transition-colors bg-brand-500",
            {
              "bg-brand-500": isLoading,
            }
          )}
          title="Enviar a IA"
        >
          {isLoading ? (
            <img className="w-8" src="/ai.gif" alt="thinking robot" />
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
