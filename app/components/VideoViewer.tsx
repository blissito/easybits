import React from "react";

const VideoViewer = () => {
  return (
    <div className="min-h-screen bg-black bg-[url('/app/assets/images/bg-grid.svg')] bg-repeat text-white relative overflow-x-hidden px-8 pb-20">
      {/* Header */}
      <header className="flex items-center py-4 gap-4">
        <button className="text-white text-2xl">←</button>
        <span className="text-sm opacity-80">Ir al Dashboard</span>
      </header>

      {/* Video player real */}
      <div className="max-w-5xl mx-auto mt-2 mb-4">
        <div className="w-full aspect-video bg-white/5 rounded-3xl shadow-lg border border-white/10 relative flex flex-col justify-end overflow-hidden">
          {/* Video real */}
          <video
            className="absolute inset-0 w-full h-full object-cover rounded-3xl"
            src="https://cdn.pixabay.com/video/2023/03/27/158011-814993904_large.mp4"
            controls={false}
            poster="https://cdn.pixabay.com/photo/2021/03/18/15/38/cat-6106706_1280.jpg"
          />
          {/* Overlay grid */}
          <div className="absolute inset-0 pointer-events-none bg-[url('/app/assets/images/bg-grid.svg')] opacity-80 rounded-3xl" />
          {/* Icono menú arriba izquierda */}
          <button className="absolute top-4 left-4 w-8 h-8 flex items-center justify-center bg-black/40 rounded-lg border border-white/10 z-10">
            <svg
              width="24"
              height="24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="7" width="16" height="2" rx="1" />
              <rect x="4" y="11" width="16" height="2" rx="1" />
              <rect x="4" y="15" width="16" height="2" rx="1" />
            </svg>
          </button>
          {/* Controles y barra de progreso (visual) */}
          <div className="absolute bottom-0 left-0 w-full px-6 pb-6 flex flex-col gap-3 z-10">
            {/* Barra de progreso */}
            <div className="w-full h-2 bg-white/10 rounded-full relative mb-2">
              <div
                className="absolute left-0 top-0 h-2 bg-purple-400 rounded-full"
                style={{ width: "44%" }}
              />
              <span
                className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-purple-400 rounded-full"
                style={{ left: "44%" }}
              ></span>
            </div>
            {/* Controles inferiores (solo visual) */}
            <div className="flex items-center justify-between text-xs text-white/80">
              <span>6:30 / 14:50</span>
              <div className="flex gap-2 items-center">
                <button className="rounded-full bg-white/10 px-2 py-1">
                  ⏪
                </button>
                <button className="rounded-full bg-white/10 px-2 py-1">
                  ⏯
                </button>
                <button className="rounded-full bg-white/10 px-2 py-1">
                  ⏩
                </button>
                <button className="rounded-full bg-white/10 px-2 py-1">
                  1x
                </button>
                <button className="rounded-full bg-white/10 px-2 py-1">
                  🔊
                </button>
                <button className="rounded-full bg-white/10 px-2 py-1">
                  ⛶
                </button>
                <button className="rounded-full bg-white/10 px-2 py-1">
                  ⚙️
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Webinar info y feedback box (igual que antes) */}
      <div className="max-w-5xl mx-auto mt-2 flex gap-6 relative">
        <div className="flex-1">
          <div className="mb-2">
            <span className="text-lg font-semibold">
              PixelPets: Crea tu mascota virtual con IA
            </span>
            <div className="flex items-center gap-2 mt-2">
              <img
                src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=80&q=80"
                alt="Alex Pixelson"
                className="w-7 h-7 rounded-full border-2 border-white"
              />
              <span className="text-sm text-white/70 font-medium">
                Alex Pixelson
              </span>
            </div>
          </div>
          <div className="flex gap-2 mb-4">
            <span className="bg-white/10 rounded-full px-3 py-1 text-xs">
              Demo
            </span>
            <span className="bg-white/10 rounded-full px-3 py-1 text-xs">
              Producto Digital
            </span>
            <span className="bg-white/10 rounded-full px-3 py-1 text-xs">
              IA
            </span>
            <span className="bg-white/10 rounded-full px-3 py-1 text-xs">
              #PixelPets
            </span>
          </div>
          <div
            className="text-xs text-white/80 leading-relaxed max-h-[320px] overflow-y-auto pr-2"
            style={{
              WebkitMaskImage: "linear-gradient(180deg, #fff 80%, transparent)",
            }}
          >
            <p className="mb-2">
              ¡Bienvenido a <b>PixelPets</b>, la app donde tu imaginación y la
              inteligencia artificial se dan la pata! 🐾
            </p>
            <p className="mb-2">
              ¿Alguna vez soñaste con tener un dragón pixelado que escupe
              arcoíris? ¿O un perrito robot que te escribe poemas? En PixelPets
              puedes crear, personalizar y coleccionar mascotas virtuales
              únicas, generadas por IA. ¡Dales nombre, personalidad y mira cómo
              evolucionan según tus ocurrencias más locas!
            </p>
            <p className="mb-2">
              Juega, comparte tus creaciones con amigos y participa en retos
              semanales para desbloquear accesorios absurdamente geniales.
              ¿Listo para adoptar a tu primer PixelPet y convertirte en el
              entrenador más original del metaverso?
            </p>
          </div>
        </div>
        {/* Feedback box */}
        <div className="w-[320px] min-w-[260px] max-w-[340px] hidden md:block">
          <div className="bg-[#F6F2FF] border border-[#E2D9F3] rounded-2xl p-6 shadow-lg relative">
            <button className="absolute top-3 right-3 text-black/40 hover:text-black/80">
              ✕
            </button>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-yellow-400 text-xl">★</span>
              <span className="text-yellow-400 text-xl">★</span>
            </div>
            <div className="font-semibold text-black mb-1">
              ¿Qué te parece el curso?
            </div>
            <div className="text-xs text-black/70 mb-4">
              Tus comentarios ayudan a la mejora y ayudan a otros usuarios a
              descubrir estos increíbles assets.
            </div>
            <button className="bg-[#FFD600] hover:bg-yellow-400 text-black font-semibold rounded-full px-4 py-2 text-sm w-full transition">
              Agregar opinión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoViewer;
