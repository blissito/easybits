import React, { useState } from "react";

const PLACEHOLDER_PROMPT =
  "Ilustración colorida de un gato con sombrero en el espacio";

export function FloatingImageGenAssistant({
  imageUrl: _imageUrl,
  prompt,
  onAddFiles,
}: {
  imageUrl?: string;
  prompt?: string;
  onAddFiles?: (files: File[]) => void;
}) {
  const [input, setInput] = useState("");
  const [imgError, setImgError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState<string | undefined>(undefined);

  // Handler para Enter (sin Shift)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && input.trim()) {
      e.preventDefault();
      generateImage(input.trim());
    }
  };

  const generateImage = async (prompt: string) => {
    setLoading(true);
    setImgError(false);
    setInfoMsg(undefined);
    setErrorMsg(undefined);

    fetch("/api/v1/ai/sugestions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        chat: JSON.stringify([{ content: prompt }]),
        intent: "generate_image_dslx",
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (data.loading) {
          setInfoMsg(
            data.message || "El modelo está cargando, por favor espera..."
          );
        } else if (data.error) {
          setErrorMsg(data.message || "Ocurrió un error generando la imagen.");
        } else if (data.url) {
          setImageUrl(data.base64 || data.url); // Usar base64 si está disponible, sino URL
        }
      })
      .catch(() => setErrorMsg("Ocurrió un error generando la imagen."))
      .finally(() => setLoading(false));
  };

  const handleAddToGallery = async () => {
    console.log("Add to gallery clicked");
    try {
      // Si tenemos base64, convertir directamente a blob
      if (imageUrl && imageUrl.startsWith("data:")) {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const fileName = `ai-generated-${Date.now()}.png`;
        const file = new File([blob], fileName, { type: "image/png" });

        console.log("File created from base64:", {
          fileName,
          size: file.size,
          type: file.type,
        });

        if (onAddFiles) {
          onAddFiles([file]);
          console.log("File added to upload list from base64");
        }
      } else if (imageUrl) {
        // Fallback: usar el endpoint del backend
        const response = await fetch("/api/v1/ai/sugestions", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            imageUrl: imageUrl,
            intent: "download_image",
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        const fileName = `ai-generated-${Date.now()}.png`;
        const file = new File([blob], fileName, { type: "image/png" });

        console.log("File created via backend:", {
          fileName,
          size: file.size,
          type: file.type,
        });

        if (onAddFiles) {
          onAddFiles([file]);
          console.log("File added to upload list via backend");
        }
      }
    } catch (error) {
      console.error("Error al procesar la imagen:", error);
    }
  };

  const handleDragStart = async (e: React.DragEvent<HTMLImageElement>) => {
    console.log("Drag start triggered", { imageUrl, onAddFiles: !!onAddFiles });
    try {
      // Si tenemos base64, convertir directamente a blob
      if (imageUrl && imageUrl.startsWith("data:")) {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const fileName = `ai-generated-${Date.now()}.png`;
        const file = new File([blob], fileName, { type: "image/png" });

        console.log("File created from base64 drag:", {
          fileName,
          size: file.size,
          type: file.type,
        });

        if (onAddFiles) {
          onAddFiles([file]);
          console.log("File added to upload list from base64 drag");
        }
      } else if (imageUrl) {
        // Fallback: usar el endpoint del backend
        const response = await fetch("/api/v1/ai/sugestions", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            imageUrl: imageUrl,
            intent: "download_image",
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        const fileName = `ai-generated-${Date.now()}.png`;
        const file = new File([blob], fileName, { type: "image/png" });

        console.log("File created via backend drag:", {
          fileName,
          size: file.size,
          type: file.type,
        });

        if (onAddFiles) {
          onAddFiles([file]);
          console.log("File added to upload list via backend drag");
        }
      }
    } catch (error) {
      console.error("Error al procesar la imagen via drag:", error);
    }
  };

  // Solo mostrar la imagen si hay url, no hay error y no está cargando ni mostrando info/error
  const showImage =
    !!imageUrl && !imgError && !loading && !infoMsg && !errorMsg;

  return (
    <div
      className="rounded-2xl shadow-lg p-4 w-80 text-center border border-gray-100 flex flex-col items-center"
      style={{ background: "rgba(152, 112, 237, 0.2)", color: "#6846b1" }}
    >
      <h3 className="font-semibold text-lg mb-2">Imagen generada por IA</h3>
      <textarea
        className={`w-full mb-2 rounded-xl px-3 py-2 text-sm resize-none border border-violet-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-200 outline-none bg-white/60 text-violet-900 placeholder-violet-400 ${
          loading ? "opacity-50 cursor-not-allowed" : ""
        }`}
        placeholder={PLACEHOLDER_PROMPT}
        rows={2}
        style={{ background: "rgba(255,255,255,0.7)" }}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={loading}
      />
      <p className="text-xs text-violet-700 mb-2">
        Presiona <span className="font-semibold">Enter</span> para generar la
        imagen
      </p>
      {loading && (
        <img
          src="/thinking_bot.gif"
          alt="Generando imagen..."
          className="w-12 h-12 mx-auto my-6"
        />
      )}
      {infoMsg && <p className="text-xs text-violet-700 mb-2">{infoMsg}</p>}
      {errorMsg && <p className="text-xs text-red-600 mb-2">{errorMsg}</p>}
      {showImage ? (
        <>
          <img
            src={imageUrl}
            draggable="true"
            onDragStart={handleDragStart}
            alt="Imagen generada por IA"
            className="max-w-[200px] max-h-[200px] mx-auto my-4 rounded-lg cursor-grab shadow"
            onError={() => setImgError(true)}
          />
          <div className="flex flex-col gap-2">
            <p className="text-sm text-violet-700">
              Arrastra esta imagen a la galería para agregarla.
            </p>
            <button
              onClick={handleAddToGallery}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-sm"
            >
              Agregar a galería
            </button>
          </div>
        </>
      ) : (
        !loading &&
        !infoMsg &&
        !errorMsg && (
          <>
            <div className="w-[200px] h-[200px] mx-auto my-4 rounded-lg border-2 border-dashed border-violet-300 flex items-center justify-center bg-violet-50">
              <svg
                className="w-16 h-16 text-violet-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                />
              </svg>
            </div>
            <p className="text-violet-700 text-sm">
              Genera una imagen para poder arrastrarla a la galería.
            </p>
          </>
        )
      )}
    </div>
  );
}
