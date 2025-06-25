import React, { useState } from "react";

export function FloatingImageGenAssistant({
  imageUrl,
  prompt,
}: {
  imageUrl?: string;
  prompt?: string;
}) {
  const [input, setInput] = useState("");
  const [imgError, setImgError] = useState(false);

  // Handler para Enter (sin Shift)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Aquí iría la lógica para enviar el prompt
      // Por ahora solo log
      console.log("Prompt enviado:", input);
    }
  };

  const showImage = imageUrl && !imgError;

  return (
    <div
      className="rounded-2xl shadow-lg p-4 w-80 text-center border border-gray-100 flex flex-col items-center"
      style={{ background: "rgba(152, 112, 237, 0.2)", color: "#6846b1" }}
    >
      <h3 className="font-semibold text-lg mb-2">Imagen generada por IA</h3>
      <textarea
        className="w-full mb-2 rounded-xl px-3 py-2 text-sm resize-none border border-violet-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-200 outline-none bg-white/60 text-violet-900 placeholder-violet-400"
        placeholder="Ejemplo: Ilustración colorida de un gato con sombrero en el espacio"
        rows={2}
        style={{ background: "rgba(255,255,255,0.7)" }}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <p className="text-xs text-violet-700 mb-2">
        Presiona <span className="font-semibold">Enter</span> para generar la
        imagen
      </p>
      {showImage ? (
        <>
          <img
            src={imageUrl}
            draggable="true"
            onDragStart={(e) => {
              e.dataTransfer.setData("text/uri-list", imageUrl!);
              // Opcional: para compatibilidad con algunos navegadores
              e.dataTransfer.setData(
                "DownloadURL",
                `image/png:${prompt || "imagen-ia"}.png:${imageUrl}`
              );
            }}
            alt="Imagen generada por IA"
            className="max-w-[200px] max-h-[200px] mx-auto my-4 rounded-lg cursor-grab shadow"
            onError={() => setImgError(true)}
          />
          <p className="text-sm text-violet-700">
            Arrastra esta imagen a la galería para agregarla.
          </p>
        </>
      ) : (
        <>
          <svg
            className="w-10 h-10 mx-auto my-4 text-violet-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 32 32"
          >
            <rect
              x="4"
              y="7"
              width="24"
              height="18"
              rx="3"
              stroke="currentColor"
              fill="#ede9fe"
            />
            <circle cx="11" cy="13" r="2" fill="currentColor" />
            <path
              d="M7 23l5-7 4 5 5-8 4 10"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
          </svg>
          <p className="text-violet-700">
            Genera una imagen para poder arrastrarla a la galería.
          </p>
        </>
      )}
    </div>
  );
}
