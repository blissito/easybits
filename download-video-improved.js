// Script mejorado para descargar video de Bluesky
// Ejecutar en la consola del navegador (F12 -> Console)

(function () {
  console.log("🔍 Buscando videos en la página...");

  // Buscar todos los elementos de video
  const videos = document.querySelectorAll("video");
  console.log(`Encontrados ${videos.length} elementos de video`);

  // Filtrar videos con blob URLs
  const blobVideos = Array.from(videos).filter(
    (video) => video.src && video.src.startsWith("blob:")
  );

  console.log(`Encontrados ${blobVideos.length} videos con blob URL`);

  if (blobVideos.length === 0) {
    console.error("❌ No se encontraron videos con blob URL");
    console.log(
      "💡 Intenta reproducir el video primero y luego ejecuta el script"
    );
    return;
  }

  // Función para intentar descargar un blob
  async function tryDownloadBlob(blobUrl, index) {
    try {
      console.log(`🔄 Intentando descargar video ${index + 1}...`);

      const response = await fetch(blobUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error("El blob está vacío");
      }

      console.log(`✅ Blob ${index + 1} obtenido:`, blob);
      console.log(`📏 Tamaño: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

      // Determinar la extensión basada en el tipo MIME
      let extension = "mp4";
      if (blob.type) {
        if (blob.type.includes("webm")) extension = "webm";
        else if (blob.type.includes("mov")) extension = "mov";
        else if (blob.type.includes("avi")) extension = "avi";
      }

      // Crear URL del blob
      const url = window.URL.createObjectURL(blob);

      // Crear elemento de descarga
      const a = document.createElement("a");
      a.href = url;
      a.download = `bluesky-video-${index + 1}-${Date.now()}.${extension}`;
      a.style.display = "none";

      // Agregar al DOM y hacer clic
      document.body.appendChild(a);
      a.click();

      // Limpiar
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      console.log(`✅ Descarga ${index + 1} iniciada: ${a.download}`);
      return true;
    } catch (error) {
      console.error(`❌ Error al descargar video ${index + 1}:`, error.message);
      return false;
    }
  }

  // Intentar descargar todos los blobs encontrados
  async function downloadAllBlobs() {
    let successCount = 0;

    for (let i = 0; i < blobVideos.length; i++) {
      const success = await tryDownloadBlob(blobVideos[i].src, i);
      if (success) successCount++;

      // Pequeña pausa entre descargas
      if (i < blobVideos.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(
      `\n📊 Resumen: ${successCount}/${blobVideos.length} videos descargados exitosamente`
    );

    if (successCount === 0) {
      console.log("\n💡 Consejos:");
      console.log("1. Asegúrate de que el video esté completamente cargado");
      console.log("2. Intenta reproducir el video primero");
      console.log("3. Refresca la página y vuelve a intentar");
      console.log("4. El blob URL puede haber expirado, intenta más tarde");
    }
  }

  // Ejecutar la descarga
  downloadAllBlobs();
})();
