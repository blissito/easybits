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
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: string; content: string }>
  >([]);
  const [aiError, setAiError] = useState<string | null>(null);

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
    setAiError(null); // Limpiar errores previos

    // Construir el contexto del Excel si existe
    const excelContextText = excelContext
      ? `\n\n=== CONTEXTO DEL ARCHIVO EXCEL ===\n${excelContext}\n=== FIN DEL CONTEXTO EXCEL ===\n\n`
      : "";

    // Determinar si es el primer prompt (sin historial)
    const isFirstPrompt = conversationHistory.length === 0;

    // Prompt del sistema mejorado
    const systemPrompt = `Eres un experto en marketing digital y copywriting especializado en crear descripciones atractivas para productos digitales.

INSTRUCCIONES CRÍTICAS:
- Título del asset: "${assetTitle}"
${
  isFirstPrompt && currentContent
    ? `- DESCRIPCIÓN ACTUAL A REFINAR (NO ELIMINAR, SOLO MEJORAR):\n"""\n${currentContent}\n"""\n`
    : `- Descripción actual: ${
        currentContent ? `"${currentContent}"` : "(sin descripción previa)"
      }`
}
- Responde SIEMPRE en español mexicano
- Usa formato markdown con títulos (# ## ###)
- Incluye citas relevantes cuando sea apropiado
- Sé creativo pero profesional
- NO agregues comentarios explicativos, solo el markdown
- NO uses bloques de código markdown, solo el contenido directo

${excelContextText}${
      excelContext
        ? `IMPORTANTE: Usa la información del archivo Excel como contexto para enriquecer la descripción, pero da prioridad a la descripción actual; pero sobre todo, sigue las instrucciones del usuario sin perder de vista el objetivo que es: describir adecuadamente: ${assetTitle}. Incorpora datos relevantes del Excel de manera natural en el texto.`
        : ""
    }

${
  isFirstPrompt
    ? `OBJETIVO: ${
        currentContent
          ? "REFINAR Y MEJORAR la descripción existente (NO reemplazar, NO eliminar contenido previo). Mantén toda la estructura y contenido existente, solo agrega o mejora según las instrucciones del usuario."
          : "Crear una nueva descripción"
      } para "${assetTitle}" según las instrucciones del usuario.`
    : "REFINAR la descripción existente. Mantén todo el contenido previo y solo agrega o mejora según las instrucciones específicas del usuario. NO elimines contenido existente."
}

REGLAS ESTRICTAS PARA REFINAMIENTO:
1. SIEMPRE mantén el contenido existente
2. SOLO agrega información nueva o mejora secciones específicas
3. NO elimines párrafos, secciones o información existente a menos que el usuario lo indique
4. Si el usuario pide "agregar" algo, INTÉGRALO en el contenido existente
5. Si el usuario pide "quitar" algo específico, solo elimina esa parte específica
6. Mantén la estructura y formato original

EJEMPLO DE REFINAMIENTO CORRECTO:
Si tienes: "Este es un curso de programación. Incluye ejercicios prácticos."
Y el usuario pide: "agrega información sobre precios"
RESPUESTA CORRECTA: "Este es un curso de programación. Incluye ejercicios prácticos. El curso tiene un precio de $99 USD y está disponible en diferentes monedas según tu país."
RESPUESTA INCORRECTA: "El curso tiene un precio de $99 USD y está disponible en diferentes monedas según tu país."`;

    // Construir el chat con historial
    const newUserMessage = {
      role: "user",
      content:
        isFirstPrompt && currentContent
          ? `CONTENIDO ACTUAL A REFINAR:\n"""\n${currentContent}\n"""\n\nINSTRUCCIÓN DEL USUARIO: ${promptText}`
          : promptText,
    };
    const updatedHistory = [...conversationHistory, newUserMessage];
    setConversationHistory(updatedHistory);

    const chat = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...updatedHistory,
    ];

    // Debug: Log del chat que se envía
    console.log("=== CHAT ENVIADO A LA IA ===");
    console.log("Excel Context:", excelContext ? "PRESENTE" : "AUSENTE");
    console.log("Excel Content:", excelContext?.substring(0, 200) + "...");
    console.log("Is First Prompt:", isFirstPrompt);
    console.log("Current Content Present:", !!currentContent);
    console.log("Current Content Length:", currentContent?.length || 0);
    console.log(
      "Current Content Preview:",
      currentContent?.substring(0, 100) + "..."
    );
    console.log("System Prompt:", systemPrompt.substring(0, 300) + "...");
    console.log("User Message:", promptText);
    console.log("Chat History Length:", updatedHistory.length);

    try {
      const response = await fetch("/api/v1/ai/sugestions", {
        method: "POST",
        body: new URLSearchParams({
          intent: "generate_sugestion",
          chat: JSON.stringify(chat),
        }),
        signal: controller.signal,
      });

      console.log("Response status:", response.status);
      console.log("Response ok:", response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server error:", response.status, errorText);
        throw new Error(
          `Error del servidor (${response.status}): ${
            errorText || "Error desconocido"
          }`
        );
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        throw new Error("No se pudo leer la respuesta del servidor");
      }

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

      // Agregar la respuesta del asistente al historial
      setConversationHistory((prev) => [
        ...prev,
        { role: "assistant", content: generatedContent },
      ]);
      setIsLoading(false);
    } catch (error) {
      console.error("Error en generación:", error);

      // No mostrar error si fue cancelado intencionalmente
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Petición cancelada intencionalmente");
        return;
      }

      // Mostrar otros errores
      const errorMessage =
        error instanceof Error ? error.message : "Error desconocido";
      setAiError(errorMessage);
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
          <div className="flex items-center gap-2 mb-2">
            <FaFileExcel className="text-brand-500" />
            <span className="text-sm font-medium text-brand-500">
              Contexto de Excel (opcional)
            </span>
          </div>

          {/* Excel Upload Area */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-3 text-center transition-colors",
              {
                "border-brand-500/30 bg-brand-500/5": !file,
                "border-brand-500/50 bg-brand-500/10": file,
              }
            )}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {!file ? (
              <div>
                <FaFileExcel className="mx-auto text-2xl text-brand-400 mb-2" />
                <p className="text-xs text-brand-500/70 mb-2">
                  Arrastra un archivo Excel aquí
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
                  className="inline-flex items-center px-2 py-1 bg-brand-500 text-white text-xs rounded-md hover:bg-brand-600 cursor-pointer transition-colors"
                >
                  Seleccionar
                </label>
              </div>
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
          {/* Removed Excel preview section */}









          {excelError && (
            <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              Error: {excelError}
            </div>
          )}

          {aiError && (
            <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              <strong>Error de IA:</strong> {aiError}
            </div>
          )}
        </div>
      )}

      {/* AI Instructions */}
      <div className="mb-4">
        <div className="text-sm text-brand-500">
          <p className="mb-2">
            Describe tu asset de forma <strong>clara y atractiva</strong>.
          </p>
          {excelContext && (
            <p className="text-brand-600 font-medium mb-2">
              ✓ Usando datos de Excel como contexto
            </p>
          )}
          {conversationHistory.length > 0 && (
            <div className="flex items-center justify-between mb-2">
              <p className="text-brand-600 font-medium">
                ✓ Historial de conversación: {conversationHistory.length}{" "}
                mensajes
              </p>
              <button
                onClick={() => setConversationHistory([])}
                className="text-xs text-brand-400 hover:text-brand-600 underline"
                type="button"
              >
                Limpiar historial
              </button>
            </div>
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
        <div className="mb-3 flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-2 text-xs text-brand-700 font-medium">
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