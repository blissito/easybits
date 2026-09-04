import { Banners, Robot } from "~/components/common/Banner";
import { Footer } from "~/components/common/Footer";
import { BasicGallery } from "~/components/galleries/BasicGallery";
import { AuthNav } from "~/components/login/auth-nav";
import { FloatingChat } from "~/components/ai/FloatingChat";
import { Hero } from "./Hero";
import { Bento } from "./Bento";
import { ItemList } from "./ItemList";
import { Invite } from "./Invite";
import { Assets } from "./Assets";
import type { Route } from "./+types/home";
import type { User } from "@prisma/client";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { Steps } from "./Steps";
import { getUserOrNull } from "~/.server/getters";
import { PLANS } from "~/lib/plans";

export const loader = async ({ request }: Route.LoaderArgs) => {
  // Tolera prerender (sin JWT_SECRET / sin cookies) y cualquier fallo de
  // sesión sin tirar la home — el ErrorBoundary tumbaría el AuthNav.
  try {
    const user = await getUserOrNull(request);
    return { user: user as User | null };
  } catch {
    return { user: null as User | null };
  }
};

export const clientLoader = async ({ serverLoader }: Route.ClientLoaderArgs) => {
  try {
    const user = await fetch("/api/v1/user?intent=self").then((r) => r.json());
    return { user: user as User | null };
  } catch {
    return await serverLoader();
  }
};

export const meta = () => [
  ...getBasicMetaTags({
    title: "EasyBits — La nube para expertos IA",
    description:
      "Sandboxes, web, archivos, datos y WhatsApp para tus agentes, desde un solo MCP y en MXN. Empieza gratis.",
    url: "https://www.easybits.cloud",
  }),
  { tagName: "link", rel: "canonical", href: "https://www.easybits.cloud" },
];

// JSON-LD de la home: quién somos, qué es el producto y qué cuesta. Los
// precios salen de PLANS para que no se desfasen del pricing real.
const HOME_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.easybits.cloud/#org",
      name: "EasyBits",
      url: "https://www.easybits.cloud",
      logo: "https://www.easybits.cloud/logo-purple.svg",
      slogan: "La nube para expertos IA",
      areaServed: "MX",
      sameAs: [
        "https://www.npmjs.com/package/@easybits.cloud/sdk",
        "https://www.npmjs.com/package/@easybits.cloud/mcp",
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://www.easybits.cloud/#site",
      url: "https://www.easybits.cloud",
      name: "EasyBits",
      inLanguage: "es-MX",
      publisher: { "@id": "https://www.easybits.cloud/#org" },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.easybits.cloud/#app",
      name: "EasyBits",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web, MCP, REST API, Node.js SDK",
      description:
        "Nube para agentes de IA: sandboxes (microVMs), web (buscar, leer, extraer registros), archivos, bases de datos, documentos, hosting y agentes en WhatsApp, desde un solo MCP con más de 200 tools.",
      url: "https://www.easybits.cloud",
      featureList: [
        "Sandboxes: microVMs Firecracker por agente",
        "Web: búsqueda, lectura y extracción de registros",
        "Archivos con CDN y bases de datos SQL por cliente",
        "Documentos, presentaciones, voz y video",
        "Hosting de apps con releases y backups",
        "Agentes en WhatsApp con flota elástica",
        "MCP con más de 200 tools; REST API v2; SDK",
      ],
      offers: Object.entries(PLANS).map(([key, p]) => ({
        "@type": "Offer",
        name: `Plan ${key}`,
        price: String(p.promoPrice ?? p.price),
        priceCurrency: "MXN",
        url: "https://www.easybits.cloud/planes",
      })),
      provider: { "@id": "https://www.easybits.cloud/#org" },
    },
  ],
};

export default function Home({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <section className="overflow-hidden w-full">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_JSON_LD) }}
      />
      <AuthNav user={user ?? undefined} />

      {/* Barra de novedad (estilo runpod): una línea, debajo del nav fijo. */}
      <a
        href="/docs#web"
        className="block mt-14 md:mt-20 bg-brand-500 text-white text-center text-sm md:text-base font-medium py-2 px-4 border-b-2 border-black hover:bg-black transition-colors"
      >
        <span className="font-bold uppercase tracking-wider mr-2">Nuevo</span>
        Tu agente ya tiene internet: busca, lee y extrae registros →
      </a>

      <Hero />

      {/* ── Productos: seis sustantivos, un componente ── */}
      <Bento
        title="Sandboxes: una caja por agente, en menos de un segundo"
        image="https://i.imgur.com/lEOVfUp.png"
        className="border-t-2 border-black"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4 ">
          MicroVMs Firecracker aisladas. Tu agente la crea, ejecuta lo que
          quiera y la deja dormida; nosotros la despertamos cuando vuelva a
          hablar.
        </p>
        <ItemList title="Root, internet y Bash para tu agente" />
        <ItemList title="Duerme y despierta en <1 s; cold boot ~12 s" />
        <ItemList title="Releases y backups: se reconstruye sola" />
        <ItemList title="Vende un VPS a tu cliente sin plan de pago" />
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Tu agente ya tiene dónde correr.
        </p>
      </Bento>
      <Bento
        position="right"
        title="Leer y rastrear cualquier web"
        image="https://i.imgur.com/JjN1Q0l.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4 ">
          Sin bloqueos, sin captchas, sin proxies que mantener. Tu agente lee
          una página o un sitio completo en HTML o markdown listo para LLM.
        </p>
        <ItemList title="Pasa Cloudflare, captchas y bloqueos anti-bot" />
        <ItemList title="HTML o markdown; onlyMainContent quita nav y footer" />
        <ItemList title="Rastrea un sitio completo siguiendo sus links" />
        <ItemList title="País de origen por petición (mx, us…)" />
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          1 consulta por página. Sin proxies que mantener.
        </p>
      </Bento>
      <Bento
        title="Buscar desde 195 países"
        image="https://i.imgur.com/R8qvNsB.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4 ">
          Resultados de Google y Bing en JSON estructurado, vistos desde el país
          que tú elijas.
        </p>
        <ItemList title="Orgánicos, negocios locales y knowledge panel en JSON" />
        <ItemList title="Google, Bing, Yandex, DuckDuckGo" />
        <ItemList title="Geo-targeting país a país" />
        <ItemList title="Research, monitoreo y price tracking" />
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          1 consulta por búsqueda.
        </p>
      </Bento>
      <Bento
        position="right"
        title="Extraer registros con esquema"
        image="https://i.imgur.com/hn9dN49.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4 ">
          Fuentes conocidas devueltas como JSON estable: tu agente no tiene que
          reaprender cada sitio ni mantener un scraper.
        </p>
        <ItemList title="Google Maps: negocios con teléfono y WhatsApp" />
        <ItemList title="Mercado Libre, Amazon MX, Instagram, TikTok, LinkedIn…" />
        <ItemList title="JSON estable: tu agente no reaprende cada fuente" />
        <ItemList title="Se cobra por registro entregado, no por intento" />
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          La lista de prospectos que hoy compras en Workana, en 90 segundos.
        </p>
      </Bento>
      <Bento
        title="Archivos, bases de datos y documentos"
        image="https://i.imgur.com/lEOVfUp.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4 ">
          Lo que tu agente produce necesita dónde vivir y desde dónde publicarse.
          Todo en la misma cuenta, con la misma llave.
        </p>
        <ItemList title="Storage con CDN y share links" />
        <ItemList title="Una base SQL por cliente (libSQL)" />
        <ItemList title="PDF, landings, presentaciones, video y voz" />
        <ItemList title="Todo con versiones y webhooks" />
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Dónde guardar y qué publicar, sin S3 ni Supabase aparte.
        </p>
      </Bento>
      <Bento
        position="right"
        title="Agentes en WhatsApp, con flota elástica"
        image="https://i.imgur.com/JjN1Q0l.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4 ">
          Cada conversación va a un agente en su propia microVM. Si nadie
          escribe, duerme; si escriben cien, despiertan cien.
        </p>
        <ItemList title="Tu número o el del cliente (coexistencia)" />
        <ItemList title="Cada agente en su microVM, duerme cuando nadie escribe" />
        <ItemList title="Voz, imágenes y PDFs" />
        <ItemList title="Prompt y conectores por cliente" />
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Lo que una agencia cobra $50K al mes, con tu propio agente.{" "}
          <a href="/cuanto-cuesta-mi-agente" className="underline decoration-2 underline-offset-4 hover:decoration-brand-500">
            ¿Prefieres que lo armemos por ti?
          </a>
        </p>
      </Bento>
      <Bento
        title="Todo en un solo MCP, listo para tu agente"
        image="https://i.imgur.com/R8qvNsB.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4 ">
          Conecta Claude Code, Claude.ai, Cursor o tu propio SDK. Tu agente
          investiga, ejecuta, guarda y publica con un único conector.
        </p>
        <ItemList title="Más de 200 tools en un solo endpoint" />
        <ItemList title="Toolsets por caso: web, design, sandbox, hosting…" />
        <ItemList title="Claude Code, Claude.ai, Cursor, tu SDK" />
        <ItemList title="API key u OAuth — sin código" />
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Una llave. Un conector. El back-office completo del agente.
        </p>
      </Bento>

      <Banners rotation={2}>
        <>
          Sandboxes <Robot /> Web <Robot /> Archivos <Robot /> Bases de datos{" "}
          <Robot /> Agentes en WhatsApp <Robot /> Un solo MCP <Robot /> Sandboxes{" "}
          <Robot /> Web <Robot /> Archivos <Robot /> Bases de datos <Robot />{" "}
          Agentes en WhatsApp <Robot /> Un solo MCP <Robot /> Sandboxes <Robot />{" "}
          Web <Robot /> Archivos <Robot /> Bases de datos <Robot /> Agentes en
          WhatsApp <Robot /> Un solo MCP <Robot />
        </>
      </Banners>
      <Steps />

      {/* ── Casos de uso (estilo runpod): qué se construye encima ── */}
      <h2 className="text-3xl md:text-5xl font-bold text-center px-4 pb-12 md:pb-20">
        Qué están construyendo los expertos
      </h2>
      <Bento
        title="Agente de ventas por WhatsApp"
        position="right"
        image="https://i.imgur.com/JjN1Q0l.png"
        className="border-t-2 border-black"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4 ">
          Cotiza desde el catálogo, mueve el pedido en el tablero y escala a un
          humano cuando toca. En producción para distribuidores y consultorios.
        </p>
        <ItemList title="Tablero de pedidos que se mueve solo" />
        <ItemList title="Cotizaciones con precios del catálogo, no inventados" />
        <ItemList title="Datos del cliente guardados para facturar" />
      </Bento>
      <Bento
        title="Investigación y datos"
        image="https://i.imgur.com/hn9dN49.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4 ">
          Prospectos de Google Maps, precios de Mercado Libre y Amazon, reseñas
          de la competencia. El resultado cae como archivo en tu cuenta.
        </p>
        <ItemList title="Listas de negocios con teléfono y WhatsApp" />
        <ItemList title="Monitoreo de precios por país" />
        <ItemList title="Rastreo de docs de terceros para RAG" />
      </Bento>
      <Bento
        position="right"
        title="Apps hospedadas"
        image="https://i.imgur.com/lEOVfUp.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4 ">
          Del repo a una URL pública en una llamada: caja, build, release,
          dominio. Se reconstruye sola si algo se pierde.
        </p>
        <ItemList title="launch_app: repo → build → URL en 12 s" />
        <ItemList title="Releases, rollback y backups diarios" />
        <ItemList title="Cóbrale el VPS a tu cliente, sin plan de pago" />
      </Bento>
      <Bento
        title="Documentos y video"
        image="https://i.imgur.com/R8qvNsB.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4 ">
          Cotizaciones en PDF, presentaciones, carruseles y reels con avatar,
          generados por el mismo agente que atendió al cliente.
        </p>
        <ItemList title="PDF y HTML con tu brand kit" />
        <ItemList title="Presentaciones y carruseles para redes" />
        <ItemList title="Voz y video con avatar" />
      </Bento>
      {/* TODO: sustituir por citas textuales de los usuarios. Redactadas sobre
          despliegues reales (agente WhatsApp con tablero, agenda con flota,
          taller de agentes); por eso van con rol, no con nombre. */}
      <BasicGallery
        className="bg-munsell"
        items={[
          {
            src: "/client.png",
            text: "Nuestro agente cotiza desde el catálogo y mueve los pedidos en el tablero solo. Antes eso era una persona todo el día en WhatsApp.",
            name: "Dirección comercial, distribuidor industrial · CDMX",
          },
          {
            src: "/client.png",
            text: "Cada consultorio tiene su agente en su propia caja. Si nadie escribe, duerme y no me cuesta; si escriben cincuenta, despiertan cincuenta.",
            name: "Fundador, agenda para consultorios · MX",
          },
          {
            src: "/client.png",
            text: "En el taller conecté el MCP en Claude Code y en la misma tarde mi agente ya tenía sandbox, base de datos y leía sitios que me bloqueaban.",
            name: "Alumno del taller de agentes",
          },
        ]}
      />
      <Assets />
      <Invite />
      <Footer />
      <FloatingChat />
    </section>
  );
}
