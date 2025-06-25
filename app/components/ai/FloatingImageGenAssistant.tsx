import React from "react";

export function FloatingImageGenAssistant({
  imageUrl,
  prompt,
}: {
  imageUrl?: string;
  prompt?: string;
}) {
  return (
    <div className="fixed bottom-6 right-6 bg-white rounded-2xl shadow-lg p-6 z-50 w-80 text-center border border-gray-100">
      <h3 className="font-semibold text-lg mb-2">Imagen generada por IA</h3>
      {imageUrl ? (
        <>
          <img
            src={imageUrl}
            draggable="true"
            onDragStart={(e) => {
              e.dataTransfer.setData("text/uri-list", imageUrl);
              // Opcional: para compatibilidad con algunos navegadores
              e.dataTransfer.setData(
                "DownloadURL",
                `image/png:${prompt || "imagen-ia"}.png:${imageUrl}`
              );
            }}
            alt="Imagen generada por IA"
            className="max-w-[200px] max-h-[200px] mx-auto my-4 rounded-lg cursor-grab shadow"
          />
          <p className="text-sm text-gray-500">
            Arrastra esta imagen a la galería para agregarla.
          </p>
        </>
      ) : (
        <p className="text-gray-500">
          Genera una imagen para poder arrastrarla a la galería.
        </p>
      )}
    </div>
  );
}
