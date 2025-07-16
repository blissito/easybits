// Script para descargar video de Bluesky
// Ejecutar en la consola del navegador (F12 -> Console)

(function () {
  // Buscar el elemento de video
  const video = document.querySelector('video[src^="blob:"]');

  if (!video) {
    console.error("No se encontró ningún video con blob URL");
    return;
  }

  console.log("Video encontrado:", video);

  // Obtener el blob URL
  const blobUrl = video.src;
  console.log("Blob URL:", blobUrl);

  // Función para descargar el blob
  async function downloadBlob() {
    try {
      // Obtener el blob desde la URL
      const response = await fetch(blobUrl);
      const blob = await response.blob();

      console.log("Blob obtenido:", blob);
      console.log("Tamaño:", (blob.size / 1024 / 1024).toFixed(2), "MB");

      // Crear URL del blob
      const url = window.URL.createObjectURL(blob);

      // Crear elemento de descarga
      const a = document.createElement("a");
      a.href = url;
      a.download = `bluesky-video-${Date.now()}.mp4`; // Nombre del archivo
      a.style.display = "none";

      // Agregar al DOM y hacer clic
      document.body.appendChild(a);
      a.click();

      // Limpiar
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      console.log("✅ Descarga iniciada");
    } catch (error) {
      console.error("❌ Error al descargar:", error);
    }
  }

  // Ejecutar la descarga
  downloadBlob();
})();
