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

export const meta = () =>
  getBasicMetaTags({
    title: "EasyBits",
    description: "Vende tus assets digitales en línea con EasyBits",
  });

export default function Home({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <section className="overflow-hidden w-full">
      <AuthNav user={user ?? undefined} />
      <Hero />

      <Bento
        title="Extrae datos de cualquier sitio web"
        image="https://i.imgur.com/JjN1Q0l.png"
        className="border-t-2 border-black"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4 ">
          Sin bloqueos, sin captchas, sin VPNs. Tu agente lee el web abierto en
          HTML limpio o markdown listo para LLM.
        </p>
        <ItemList title="HTML completo o markdown estructurado" />
        <ItemList title="Sortea anti-bot, captchas y rate limits" />
        <ItemList title="Selecciona país de origen por petición" />
        <ItemList title="Disponible vía MCP y REST API" />
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Lo conectas una vez. Tu agente extrae cuando lo necesite.
        </p>
      </Bento>
      <Bento
        position="right"
        title="Búsqueda global desde 195 países"
        image="https://i.imgur.com/R8qvNsB.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4 ">
          Resultados de Google y Bing en JSON estructurado, con red de IPs
          residenciales y datacenter en cualquier región del mundo.
        </p>
        <ItemList title="SERPs estructuradas (orgánicos, ads, knowledge panels)" />
        <ItemList title="Más de 400 millones de IPs residenciales e ISP" />
        <ItemList title="Geo-targeting país a país" />
        <ItemList title="Compatible con research, monitoring y price tracking" />
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Investigación de mercado, SEO y pricing — sin armar la infra.
        </p>
      </Bento>
      <Bento
        title="Todo en un solo MCP, listo para tu agente"
        image="https://i.imgur.com/lEOVfUp.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4 ">
          Conecta Claude Code, Claude Desktop, Cursor o cualquier cliente MCP.
          Tu agente investiga, almacena, genera documentos y lanza landings con
          un único conector.
        </p>
        <ItemList title="Más de 40 tools en un solo endpoint" />
        <ItemList title="Scraping y búsqueda web incluidos" />
        <ItemList title="Almacenamiento, formularios, DBs y generación de docs/landings" />
        <ItemList title="Autenticación por API key — sin código" />
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Una API key, un MCP, todo el back-office del agente.
        </p>
      </Bento>

      <Banners rotation={2}>
        <>
          Crea una cuenta gratis <Robot /> Vende tu primer asset <Robot />{" "}
          Almacena tus archivos <Robot /> Crea una cuenta gratis <Robot /> Vende
          tu primer asset <Robot /> Almacena tus archivos <Robot /> Crea una
          cuenta gratis <Robot /> Vende tu primer asset <Robot /> Almacena tus
          archivos <Robot /> Crea una cuenta gratis <Robot /> Vende tu primer
          asset <Robot /> Almacena tus archivos <Robot />
        </>
      </Banners>
      <Steps />

      <Bento
        title="Vende lo que quieras"
        position="right"
        image="https://i.imgur.com/JjN1Q0l.png"
        className="border-t-2 border-black"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-4 ">
          Desde cursos en video y libros, hasta ilustraciones, fotografías,
          plantillas o lo que sea. ¡Sí, lo que sea!{" "}
        </p>

        <ItemList title="Tu set de fotografías" />
        <ItemList title="Tu libro de diseño" />
        <ItemList title="Tu paquete de ilustraciones" />
        <ItemList title="Tu curso de inglés" />
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Y todo lo que puedas imaginar.
        </p>
      </Bento>
      <Bento
        title="Vende a quien quieras donde quieras"
        image="https://i.imgur.com/R8qvNsB.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-8 ">
          ¿Ya tienes clientes o un club de seguidores? Comparte tu website y
          permite que tu comunidad, seguidores o clientes compren fácilmente.
        </p>
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Y eso no es todo, llega a más personas siendo parte de la Comunidad
          EasyBits.
        </p>
      </Bento>
      <Bento
        position="right"
        title="Recibe tus pagos fácilmente"
        image="https://i.imgur.com/lEOVfUp.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-8 ">
          Acepta las formas de pago que se adecúen a tu audiencia, incluso pagos
          internacionales seguros y rápidos.
        </p>
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Sin letras chiquitas ni comisiones abusivas, recibe tus pagos
          directamente en tu cuenta bancaria cada 48 hrs.
        </p>
      </Bento>
      <Bento
        title="Y además ¡Almacena tus archivos! "
        image="https://i.imgur.com/hn9dN49.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-8 ">
          Usa EasyBits para almacenar y optimizar todo tipo de archivos y
          compartirlos con tus amigos o clientes.
        </p>
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          ¿Necesitas storage para tu propia palataforma web? Usa nuestra API
          para agregar o eliminar archivos desde tu plataforma de forma fácil.
        </p>
      </Bento>
      <BasicGallery
        className="bg-munsell"
        items={[
          {
            src: "/client.png",
            text: "Trabajé por mucho tiempo en un UI Kit pero tenía muchas dudas de cómo venderlo, cuando encontré EasyBits me di cuenta de que vender un asset puede ser fácil con la herramienta correcta.",
            name: "Brenda Ortega",
          },
          {
            src: "/client.png",
            text: "Todo el tiempo estamos aprendiendo en comunidad, la demanda de mi audiencia por contenido nuevo es siempre vigente, por eso, EasyBits se ha vuelto una de mis mejores herramientas para planear mi siguiente asset digital, desarrollarlo, publicarlo y cobrar. 💵",
            name: "Héctorbliss",
          },
          {
            src: "/client.png",
            text: "Antes armaba landing pages con herramientas caras y complicadas. Con EasyBits creo mis landings en minutos, comparto el link y listo. Rápido, bonito y sin complicaciones.",
            name: "Karla Ocampo",
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
