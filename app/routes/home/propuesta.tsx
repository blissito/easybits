// Borrador de home orientada a la estrategia "web es el gancho, la caja es el
// producto, hosting + flota es la renta". No está enlazada; vive en /propuesta-home.
import { motion } from "motion/react";
import { Link } from "react-router";
import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import { BrutalButton } from "~/components/common/BrutalButton";
import { Banners, Robot } from "~/components/common/Banner";
import { Bento } from "./Bento";
import { ItemList } from "./ItemList";
import { HOSTING_CATALOG, HIDDEN_TIERS, TIER_ORDER } from "~/lib/hostingCatalog";
import { effectivePrice } from "~/lib/plans";

// Precios derivados del catálogo real para que el borrador no se desfase.
const HOSTING_FROM = `$${Math.min(...TIER_ORDER.filter((k) => !HIDDEN_TIERS.has(k)).map((k) => HOSTING_CATALOG[k].priceShared))}`;
const PLAN_FROM = `$${effectivePrice("Mega")}`;

export const meta = () => [
  { title: "EasyBits — La caja de tu agente de IA. El hosting de tu cliente." },
  { name: "robots", content: "noindex" },
];

export default function PropuestaHome() {
  return (
    <section className="overflow-hidden w-full">
      <AuthNav />

      <a
        href="/web"
        className="block mt-14 md:mt-20 bg-brand-500 text-white text-center text-sm md:text-base font-medium py-2 px-4 border-b-2 border-black hover:bg-black transition-colors"
      >
        <span className="font-bold uppercase tracking-wider mr-2">Gratis</span>
        50 consultas web para que tu agente lea internet. Lo que encuentre, lo
        guarda en su caja →
      </a>

      <Hero />

      <Banners rotation={2}>
        <>
          La caja no se borra <Robot /> Se despierta en menos de 1 s <Robot />{" "}
          Se vuelve hosting <Robot /> Atiende WhatsApp <Robot /> En pesos{" "}
          <Robot /> La caja no se borra <Robot /> Se despierta en menos de 1 s{" "}
          <Robot /> Se vuelve hosting <Robot /> Atiende WhatsApp <Robot /> En
          pesos <Robot />
        </>
      </Banners>

      <Compare />

      {/* La escalera: cada bento es un escalón del cliente. */}
      <h2 className="text-3xl md:text-5xl font-bold text-center px-4 pt-20 pb-12 md:pb-20">
        Del primer prompt a la renta mensual
      </h2>
      <Bento
        title="1 · Tu agente lee internet"
        image="https://i.imgur.com/JjN1Q0l.png"
        className="border-t-2 border-black"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4">
          Busca, lee sitios que bloquean y saca registros con esquema. Es la
          forma más rápida de ver a tu agente hacer algo útil.
        </p>
        <ItemList title="Google Maps: negocios con teléfono y WhatsApp" />
        <ItemList title="Mercado Libre, Amazon MX, Instagram, TikTok" />
        <ItemList title="50 consultas gratis al registrarte" />
      </Bento>
      <Bento
        position="right"
        title="2 · Lo guarda en su propia caja"
        image="https://i.imgur.com/lEOVfUp.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4">
          Una microVM con root, internet y disco. Cuando el agente se calla,
          la caja se duerme; cuando vuelve a hablar, despierta tal como la dejó.
        </p>
        <ItemList title="Despierta en menos de 1 s, con su disco intacto" />
        <ItemList title="Base SQL y archivos con CDN en la misma llave" />
        <ItemList title="Un MCP: Claude Code, Claude.ai, Cursor, tu SDK" />
      </Bento>
      <Bento
        title="3 · Lo que construyó, se publica"
        image="https://i.imgur.com/R8qvNsB.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4">
          Del repo a una URL pública en una llamada. Cada app es una máquina
          con su release y su respaldo diario.
        </p>
        <ItemList title="launch_app: repo → build → URL en 12 s" />
        <ItemList title="Rollback y recuperación tras pérdida en 11.9 s" />
        <ItemList title={`Máquinas desde ${HOSTING_FROM} MXN/mes, sin plan de pago`} />
      </Bento>
      <Bento
        position="right"
        title="4 · Y atiende a tus clientes por WhatsApp"
        image="https://i.imgur.com/hn9dN49.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4">
          Cada conversación va a su caja. Si nadie escribe, duerme y no cuesta;
          si escriben cien, despiertan cien.
        </p>
        <ItemList title="Tu número o el de tu cliente (coexistencia)" />
        <ItemList title="Prompt, conectores y base por cliente" />
        <ItemList title="Cotiza, mueve el tablero y escala a un humano" />
      </Bento>

      <Integrators />

      <section className="text-center px-4 py-24 border-t-2 border-black">
        <h2 className="text-3xl md:text-5xl font-bold max-w-3xl mx-auto">
          Dale a tu agente una caja hoy.
        </h2>
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-10">
          Empieza gratis. Planes desde {PLAN_FROM} MXN/mes cuando tu cliente pague.
        </p>
        <Link to="/login?next=/dash/hosting">
          <BrutalButton id="EmpezarGratisPropuesta">Crear mi caja gratis →</BrutalButton>
        </Link>
      </section>
      <Footer />
    </section>
  );
}

const Hero = () => (
  <section className="pt-12 pb-16 md:min-h-[82vh] flex flex-wrap md:flex-nowrap items-center justify-between gap-10 px-4 md:px-[5%] xl:px-0 max-w-7xl mx-auto">
    <div className="w-full md:w-[52%] text-center md:text-left">
      <p className="font-mono text-sm uppercase tracking-widest text-brand-500 font-bold mb-4">
        Para quien construye agentes y los vende
      </p>
      <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-[68px] leading-[1.05] font-bold">
        La caja de tu agente de IA.{" "}
        <span className="underline decoration-4 decoration-brand-500 underline-offset-4">
          El hosting de tu cliente.
        </span>
      </h1>
      <p className="text-iron text-xl lg:text-2xl font-extralight mt-6 mb-10">
        Tu agente trabaja en una microVM que no se borra. Lo que construye se
        publica con URL, y tú se lo cobras a tu cliente cada mes. En pesos.
      </p>
      <div className="flex flex-wrap items-center gap-4 justify-center md:justify-start">
        <Link to="/login?next=/dash/hosting">
          <BrutalButton id="EmpezarGratisHeroPropuesta">Crear mi caja gratis →</BrutalButton>
        </Link>
        <a href="/aprende" className="text-lg font-bold underline decoration-2 underline-offset-4 hover:decoration-brand-500">
          Curso: vende tu agente
        </a>
      </div>
      <p className="text-iron text-sm md:text-base mt-8 font-mono">
        Despierta en &lt;1 s · redeploy en 12 s · un endpoint MCP · MXN
      </p>
    </div>
    {/* La muchacha se queda; la caja flota encima como una de las tarjetas del hero actual. */}
    <div className="w-full md:w-[44%] relative">
      <img className="w-[70%] md:w-[85%] mx-auto" alt="persona sonriendo" src="/home/hero-img.webp" />
      <motion.div
        className="relative -mt-10 mx-auto w-[88%] md:mt-0 md:absolute md:-left-16 md:bottom-4 md:w-[72%]"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, type: "spring", delay: 0.2 }}
      >
        <BoxLifecycle />
      </motion.div>
    </div>
  </section>
);

// Ilustración del hero: la misma caja pasa por cuatro estados, y la URL al final
// es la prueba de que no se tiró. Bucle finito (3 vueltas) a propósito.
const STATES = [
  { label: "creando", tint: "bg-white", line: "$ npm run build", dot: "bg-yellow-400" },
  { label: "dormida", tint: "bg-[#efe9ff]", line: "zzz · disco intacto", dot: "bg-gray-400" },
  { label: "despierta 0.8 s", tint: "bg-white", line: "$ node server.js", dot: "bg-green-500" },
  { label: "publicada", tint: "bg-[#fff6d6]", line: "https://cotiza.easybits.cloud", dot: "bg-brand-500" },
];

const BoxLifecycle = () => (
  <div className="relative">
    <div className="border-2 border-black bg-black text-white font-mono text-xs px-4 py-2 flex justify-between">
      <span>caja · agente-ventas-01</span>
      <span className="hidden sm:inline">micro · 1 GB</span>
    </div>
    <div className="relative h-36 md:h-40 bg-white border-2 border-t-0 border-black shadow-[8px_8px_0_#000] overflow-hidden">
      {STATES.map((s, i) => (
        <motion.div
          key={s.label}
          className={`absolute inset-0 p-4 flex flex-col justify-between ${s.tint}`}
          initial={{ opacity: i === 0 ? 1 : 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{
            duration: 2.4,
            times: [0, 0.1, 0.85, 1],
            delay: i * 2.4,
            repeat: 2,
            repeatDelay: STATES.length * 2.4 - 2.4,
          }}
        >
          <div className="flex items-center gap-3">
            <span className={`w-4 h-4 rounded-full border-2 border-black ${s.dot}`} />
            <span className="text-xl md:text-2xl font-bold">{s.label}</span>
          </div>
          <code className="text-sm md:text-base border-2 border-black bg-white px-3 py-1.5 self-start">
            {s.line}
          </code>
        </motion.div>
      ))}
    </div>
    <div className="mt-3 grid grid-cols-4 text-center font-mono text-xs">
      {STATES.map((s) => (
        <span key={s.label} className="border-2 border-black -ml-[2px] py-2 bg-white">
          {s.label.split(" ")[0]}
        </span>
      ))}
    </div>
  </div>
);

const Compare = () => (
  <section className="px-4 md:px-[5%] xl:px-0 max-w-7xl mx-auto py-20">
    <h2 className="text-3xl md:text-5xl font-bold text-center mb-12">
      Los demás tiran la caja al terminar
    </h2>
    <div className="grid md:grid-cols-2 gap-8">
      <div className="border-2 border-black p-8 bg-white">
        <p className="font-mono text-sm uppercase tracking-widest text-iron mb-4">Sandbox desechable</p>
        <ItemList title="Una VM nueva por llamada, borrada al terminar" />
        <ItemList title="Corre en tu máquina, no en la nube" />
        <ItemList title="Para publicar, buscas otro proveedor" />
        <ItemList title="Cobro en dólares" />
      </div>
      <div className="border-2 border-black p-8 bg-brand-500 text-white shadow-[8px_8px_0_#000] [&_p]:text-white">
        <p className="font-mono text-sm uppercase tracking-widest mb-4 font-bold">Caja EasyBits</p>
        <ItemList title="La misma caja, dormida o despierta, con su disco" />
        <ItemList title="Remota: un clic desde el registro MCP" />
        <ItemList title="Se vuelve hosting con release y respaldo" />
        <ItemList title="Cobro en MXN, soporte en español" />
      </div>
    </div>
  </section>
);

const Integrators = () => (
  <section className="bg-black text-white px-4 md:px-[5%] py-24">
    <div className="max-w-7xl mx-auto">
      <p className="font-mono text-sm uppercase tracking-widest text-yellow-300 font-bold mb-4">
        Para integradores
      </p>
      <h2 className="text-3xl md:text-5xl font-bold max-w-3xl">
        Tú le cobras a tu cliente. Nosotros ponemos el fierro.
      </h2>
      <div className="grid md:grid-cols-3 gap-6 mt-12">
        {[
          ["Una caja por cliente", "Su agente, su base y sus archivos aislados. Si un cliente se va, borras una caja."],
          ["Una máquina, una suscripción", `Cada app de cliente es su propia suscripción desde ${HOSTING_FROM} MXN/mes. Sin plan de pago para empezar.`],
          ["Curso: vende tu agente", "Multi-tenant, cobro, hosting y casos con números. Avanza solo, contra tu uso real."],
        ].map(([t, d]) => (
          <div key={t} className="border-2 border-white p-6 shadow-[8px_8px_0_#7c3aed]">
            <h3 className="text-2xl font-bold">{t}</h3>
            <p className="text-gray-300 text-lg mt-3">{d}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
