// Script para grabar video desde Bluesky usando MediaRecorder
// Abre la consola del navegador en la página de Bluesky donde está el video
// Pega y ejecuta este script

(function () {
  console.log("🎬 Iniciando grabador de video con audio...");

  // Buscar el video en la página
  const video = document.querySelector("video");

  if (!video) {
    console.error("❌ No se encontró ningún video en la página");
    return;
  }

  console.log("✅ Video encontrado:", video);
  console.log("📹 Duración del video:", video.duration, "segundos");

  // Crear contexto de audio para capturar el audio del video
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const audioSource = audioContext.createMediaElementSource(video);
  const audioDestination = audioContext.createMediaStreamDestination();

  // Conectar el audio del video al destino del stream
  audioSource.connect(audioDestination);
  audioSource.connect(audioContext.destination); // Mantener el audio original

  // Obtener el stream de video
  const videoStream = video.captureStream();

  // Combinar video y audio streams
  const combinedStream = new MediaStream();

  // Agregar pistas de video
  videoStream.getVideoTracks().forEach((track) => {
    combinedStream.addTrack(track);
    console.log("📹 Pista de video agregada");
  });

  // Agregar pistas de audio
  audioDestination.stream.getAudioTracks().forEach((track) => {
    combinedStream.addTrack(track);
    console.log("🎵 Pista de audio agregada");
  });

  // Crear MediaRecorder con el stream combinado
  const mediaRecorder = new MediaRecorder(combinedStream, {
    mimeType: "video/webm;codecs=vp9,opus",
  });

  // Fallback para navegadores que no soportan VP9+Opus
  if (!MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
    mediaRecorder.mimeType = "video/webm;codecs=vp8,vorbis";
    console.log("⚠️ Usando codec fallback: VP8 + Vorbis");
  }

  let recordedChunks = [];
  let isRecording = false;

  // Función para descargar el video
  function downloadVideo() {
    if (recordedChunks.length === 0) {
      console.log("❌ No hay datos grabados para descargar");
      return;
    }

    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `bluesky-video-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
    console.log("✅ Video con audio descargado exitosamente");
    console.log(
      `📏 Tamaño del archivo: ${(blob.size / 1024 / 1024).toFixed(2)} MB`
    );
  }

  // Función para detener la grabación
  function stopRecording() {
    if (!isRecording) return;

    mediaRecorder.stop();
    isRecording = false;
    console.log("⏹️ Grabación detenida");

    // Limpiar el listener del evento 'ended'
    video.removeEventListener("ended", stopRecording);

    // Cerrar el contexto de audio
    audioContext.close();
  }

  // Configurar eventos del MediaRecorder
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
      console.log("📦 Chunk de datos recibido:", event.data.size, "bytes");
    }
  };

  mediaRecorder.onstop = () => {
    console.log("🎬 Grabación completada, descargando video...");
    downloadVideo();
  };

  mediaRecorder.onerror = (event) => {
    console.error("❌ Error en la grabación:", event.error);
  };

  // Detectar cuando el video termina y detener automáticamente
  video.addEventListener("ended", () => {
    console.log("🎬 Video terminado, deteniendo grabación automáticamente...");
    stopRecording();
  });

  // Iniciar grabación
  mediaRecorder.start(1000); // Capturar cada segundo
  isRecording = true;

  console.log("🎬 Grabación iniciada con video y audio...");
  console.log("📝 Para detener manualmente, ejecuta: stopRecording()");
  console.log("📝 Para descargar manualmente, ejecuta: downloadVideo()");

  // Hacer las funciones disponibles globalmente
  window.stopRecording = stopRecording;
  window.downloadVideo = downloadVideo;

  // Mostrar información del video
  console.log("📊 Información del video:");
  console.log("- Duración:", video.duration, "segundos");
  console.log("- Ancho:", video.videoWidth, "px");
  console.log("- Alto:", video.videoHeight, "px");
  console.log("- Estado:", video.paused ? "Pausado" : "Reproduciendo");
  console.log("- Codec usado:", mediaRecorder.mimeType);
})();
