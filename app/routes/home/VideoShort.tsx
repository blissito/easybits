// Sección de video: el short vertical "los agentes para tus aplicaciones web".
// Fuente y pipeline en videos/short-01; el MP4 vive en el bucket público.
const VIDEO_URL =
  "https://easybits-public.t3.storage.dev/699f35cbc8ad86037eda62b1/IjEec1R_6NQR";
const POSTER_URL =
  "https://easybits-public.t3.storage.dev/699f35cbc8ad86037eda62b1/-ud-wu48rtx6";

export const VideoShort = () => {
  return (
    <section className="border-b-[2px] border-b-black bg-[#F3F0F5]">
      <div className="max-w-7xl mx-auto px-4 md:px-[5%] xl:px-0 py-16 md:py-24 flex flex-col md:flex-row items-center gap-10 md:gap-16">
        <div className="w-full md:w-1/2 order-2 md:order-1">
          <span className="inline-block bg-black text-[#D9FF3D] font-mono text-xs md:text-sm uppercase tracking-[0.22em] px-4 py-2 border-2 border-black">
            En 50 segundos
          </span>
          <h2 className="text-3xl lg:text-5xl font-bold mt-6 !leading-tight">
            Los agentes para tus{" "}
            <span className="bg-[#D9FF3D] px-1">aplicaciones web</span>
          </h2>
          <p className="text-iron text-xl lg:text-2xl mt-6">
            Tú escribes las herramientas de tus datos. El agente, la memoria y
            WhatsApp los pone EasyBits, por una cuota fija al mes. Así lo usan
            Normi, Formmy y Denik.
          </p>
          <a
            href="/docs#flota"
            className="inline-block mt-8 text-lg md:text-xl font-bold border-2 border-black bg-[#D9FF3D] px-6 py-3 shadow-[6px_6px_0_#111] hover:bg-black hover:text-[#D9FF3D] transition-colors"
          >
            Cómo se conecta →
          </a>
        </div>
        <div className="w-full md:w-1/2 order-1 md:order-2 flex justify-center">
          <video
            className="w-[300px] md:w-[340px] lg:w-[380px] aspect-[9/16] bg-black border-[4px] border-black shadow-[14px_14px_0_#111] object-cover"
            src={VIDEO_URL}
            poster={POSTER_URL}
            controls
            playsInline
            preload="metadata"
            aria-label="Los agentes para tus aplicaciones web — EasyBits"
          />
        </div>
      </div>
    </section>
  );
};
