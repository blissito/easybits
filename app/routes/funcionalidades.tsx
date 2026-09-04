import { AuthNav } from "~/components/login/auth-nav";
import { Footer } from "~/components/common/Footer";
import type { ReactNode } from "react";
import { IoClose } from "react-icons/io5";
import { SuscriptionBox } from "./blog/SuscriptionBox";
import { TbPigMoney, TbShoppingBag, TbWorldWww } from "react-icons/tb";
import { Banners, Robot } from "~/components/common/Banner";
import { PiPaintBrushBroad } from "react-icons/pi";
import { BiCommentDetail, BiHappy, BiSupport } from "react-icons/bi";
import { BrutalButton } from "~/components/common/BrutalButton";
import {
  SiGoogleanalytics,
  SiGooglecontaineroptimizedos,
} from "react-icons/si";
import { GrAnalytics } from "react-icons/gr";

import { FaUsers } from "react-icons/fa";
import {
  MdOutlineStorage,
  MdStorefront,
  MdVideogameAsset,
} from "react-icons/md";
import { CgWebsite } from "react-icons/cg";
import { RiDiscountPercentLine, RiRobot2Fill } from "react-icons/ri";
import { AiOutlineApi } from "react-icons/ai";
import type { Route } from "./+types/funcionalidades";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { cn } from "~/utils/cn";
import { TextBlurEffect } from "~/components/TextBlurEffect";
import { FloatingChat } from "~/components/ai/FloatingChat";

export const clientLoader = async () => {
  const user = await fetch("/api/v1/user?intent=self").then((r) => r.json());
  return { user };
};

export const meta = () =>
  getBasicMetaTags({
    title: "Funcionalidades — La nube para expertos IA | EasyBits",
    description:
      "Sandboxes, web (buscar, leer, extraer), archivos, bases de datos, documentos, hosting y agentes en WhatsApp: todo lo que tu agente puede hacer desde un solo MCP, en MXN.",
  });

export default function Blog({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <section>
      <AuthNav user={user} />
      <div className="overflow-hidden ">
        <FeaturesHeader />
        <Banners rotation={0}>
          <>
            Sandboxes <Robot /> Web <Robot /> Archivos <Robot /> Bases de datos{" "}
            <Robot /> Agentes en WhatsApp <Robot /> Un solo MCP <Robot />{" "}
            Sandboxes <Robot /> Web <Robot /> Archivos <Robot /> Bases de datos{" "}
            <Robot /> Agentes en WhatsApp <Robot /> Un solo MCP <Robot />{" "}
            Sandboxes <Robot /> Web <Robot /> Archivos <Robot /> Bases de datos{" "}
            <Robot /> Agentes en WhatsApp <Robot /> Un solo MCP <Robot />
          </>
        </Banners>
      </div>
      <FeaturesScroll />
      <div className="px-4 md:px-[5%] xl:px-0">
        <SuscriptionBox className="w-full max-w-7xl my-20 md:my-40 " />{" "}
      </div>
      <Footer />
      <FloatingChat chatClassName="md:bottom-10" className="md:bottom-20" />
    </section>
  );
}

const FeaturesScroll = () => {
  return (
    <section className=" w-full bg-white ">
      <div className="sticky top-0 w-full  h-[90vh] flex justify-center items-center">
        <img
          className="absolute left-6 top-16 md:left-80  md:top-32 w-8 md:w-auto"
          alt="star"
          src="/home/star.svg"
        />
        <img
          className="absolute w-8 md:w-auto right-40 -bottom-20"
          alt="star"
          src="/home/star.svg"
        />
        <img
          className="absolute right-20 top-16 md:top-32 md:right-80 w-10 md:w-16"
          alt="waves"
          src="/home/waves.svg"
        />
        <img
          className="absolute w-8 left-[660px] bottom-10 hidden md:block"
          alt="asterisk"
          src="/home/asterisk.svg"
        />
        <img
          className="absolute w-12 right-12 bottom-40 md:top-96"
          alt="diamonds"
          src="/home/diamonds.svg"
        />
        <img
          className="absolute w-32 -left-16 bottom-0"
          alt="espiral"
          src="/home/espiral.svg"
        />
        <div className="z-10 relative">
          <img
            className="w-40 md:w-48 mx-auto mb-10"
            src="/home/logo-glasses.svg"
          />
          <h2 className="text-5xl xl:text-9xl font-bold leading-snug mb-6 md:mb-12 text-center w-full text-black ">
            ¿Qué puede hacer
            <br /> tu agente?
          </h2>{" "}
        </div>
      </div>

      <div className=" mx-auto px-4 md:px-[5%] xl:px-[0] w-full pb-0 md:pb-40 max-w-7xl  overflow-hidden ">
        <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6  ">
          <Card
            icon={<SiGooglecontaineroptimizedos />}
            bgColor="bg-[#93E6EB]"
            title="Sandboxes: una microVM por agente"
            description={
              <p>
                Tu agente crea su caja, ejecuta código con root e internet y la deja dormida. Despierta en menos de un segundo; cold boot en ~12 s.{" "}
                <span className="text-[#457D7B] font-bold">Firecracker, releases, backups y hosting de la misma caja.</span>
              </p>
            }
          />
          <Card
            icon={<TbWorldWww />}
            bgColor="bg-[#D4EB93]"
            title="Leer y rastrear cualquier web"
            description={
              <p>
                Una página o un sitio completo, aunque bloquee bots. HTML o markdown limpio con onlyMainContent.{" "}
                <span className="text-[#457D7B] font-bold">1 consulta por página. Sin proxies que mantener.</span>
              </p>
            }
          />
          <Card
            icon={<GrAnalytics />}
            bgColor="bg-[#CDB8F9]"
            title="Buscar desde 195 países"
            description={
              <p>
                Google, Bing, Yandex y DuckDuckGo en JSON estructurado: orgánicos, negocios locales, knowledge panel.{" "}
                <span className="text-[#457D7B] font-bold">Geo por país. 1 consulta por búsqueda.</span>
              </p>
            }
          />
          <Card
            icon={<MdStorefront />}
            bgColor="bg-[#FADB6F]"
            title="Extraer registros con esquema"
            description={
              <p>
                Google Maps con teléfono y WhatsApp, Mercado Libre, Amazon MX, Instagram, TikTok, LinkedIn y más de 1,000 fuentes.{" "}
                <span className="text-[#457D7B] font-bold">Se cobra por registro entregado, no por intento.</span>
              </p>
            }
          />
          <Card
            icon={<MdOutlineStorage />}
            bgColor="bg-[#DCE2F0]"
            title="Archivos con CDN"
            description={
              <p>
                Sube, versiona, comparte con links y recibe webhooks. Lo que tu agente produce ya tiene dónde vivir.{" "}
                <span className="text-[#457D7B] font-bold">upload_file, share links, optimización de imágenes.</span>
              </p>
            }
          />
          <Card
            icon={<SiGoogleanalytics />}
            bgColor="bg-[#B2DAD8]"
            title="Una base de datos por cliente"
            description={
              <p>
                SQL (libSQL) por cliente o por caja, sin pooling que administrar. Backup y restore entre cuentas.{" "}
                <span className="text-[#457D7B] font-bold">db_create, db_query, db_exec.</span>
              </p>
            }
          />
          <Card
            icon={<PiPaintBrushBroad />}
            bgColor="bg-[#E0AC6E]"
            title="Documentos, landings y presentaciones"
            description={
              <p>
                Cotizaciones y reportes en PDF, landings y slides en HTML, con tu brand kit. Se publican en tu subdominio.{" "}
                <span className="text-[#457D7B] font-bold">create_document, structured_doc, deploy_document.</span>
              </p>
            }
          />
          <Card
            icon={<BiCommentDetail />}
            bgColor="bg-[#FCCCBD]"
            title="Voz y video"
            description={
              <p>
                Transcribe audio, sintetiza voz, genera subtítulos y arma reels con avatar desde el mismo conector.{" "}
                <span className="text-[#457D7B] font-bold">voice_tts_create, video_create, generate_captions.</span>
              </p>
            }
          />
          <Card
            icon={<RiRobot2Fill />}
            bgColor="bg-[#F7E1FD]"
            title="Hosting de apps en una llamada"
            description={
              <p>
                Del repo a una URL pública: caja, build, release y dominio. Se reconstruye sola si algo se pierde.{" "}
                <span className="text-[#457D7B] font-bold">launch_app en 12 s; rollback y backups diarios.</span>
              </p>
            }
          />
          <Card
            icon={<BiSupport />}
            bgColor="bg-[#EBBBE9]"
            title="Agentes en WhatsApp con flota elástica"
            description={
              <p>
                Tu número o el del cliente. Cada conversación en su microVM: duerme si nadie escribe, despierta cuando hablan.{" "}
                <span className="text-[#457D7B] font-bold">Prompt, conectores y voz por cliente.</span>
              </p>
            }
          />
          <Card
            icon={<AiOutlineApi />}
            bgColor="bg-[#93E6EB]"
            title="Un solo MCP, REST y SDK"
            description={
              <p>
                Más de 200 tools en un endpoint, toolsets por caso (web, design, sandbox, hosting) y el mismo contrato en REST v2 y @easybits.cloud/sdk.{" "}
                <span className="text-[#457D7B] font-bold">Claude Code, Claude.ai, Cursor o tu propio agente.</span>
              </p>
            }
          />
          <Card
            icon={<TbPigMoney />}
            bgColor="bg-[#D4EB93]"
            title="Modelos LLM con tu llave"
            description={
              <p>
                Claude, DeepSeek y más por un gateway OpenAI-compatible. Cualquier cliente funciona sin cambiar código.{" "}
                <span className="text-[#457D7B] font-bold">Tokens en MXN, sin cuenta con el proveedor.</span>
              </p>
            }
          />
          <Card
            icon={<MdVideogameAsset />}
            bgColor="bg-[#CDB8F9]"
            title="Packs sin caducidad, en MXN"
            description={
              <p>
                Consultas web, créditos y tokens se compran por pack para cualquier plan, incluido el gratuito, y no caducan.{" "}
                <span className="text-[#457D7B] font-bold">Empiezas gratis: 1 caja, 50 consultas web, 100 MB.</span>
              </p>
            }
          />
          <Card
            icon={<BiHappy />}
            bgColor="bg-[#FADB6F]"
            title="Soporte en español"
            description={
              <p>
                Docs completas, llms.txt para tu agente y un humano que responde en tu idioma cuando hace falta.{" "}
                <span className="text-[#457D7B] font-bold">Agenda 15 minutos desde la home.</span>
              </p>
            }
          />
        </div>
      </div>
    </section>
  );
};

const Card = ({
  title,
  description,
  icon,
  className,
  bgColor,
  variant = "default",
  image,
}: {
  title?: string;
  description?: ReactNode;
  icon?: ReactNode;
  className?: string;
  bgColor?: string;
  variant?: string;
  image?: string;
}) => {
  return (
    <div className={cn("z-20 w-full col-span-1 bg-white ", className)}>
      <div
        className={cn("border-[2px]  h-full border-black p-6 md:p-10 ", {
          "p-0 md:p-0": variant === "fullImage",
        })}
      >
        {variant === "fullImage" ? (
          <img src={image} className="w-full h-hull object-cover" />
        ) : (
          <>
            {" "}
            <div className="flex flex-col items-start  gap-3  flex-wrap">
              <span
                className={cn(
                  "text-3xl bg-white w-12 h-12 rounded-full flex justify-center items-center border border-black",
                  bgColor
                )}
              >
                {icon}
              </span>
              <h3 className="text-2xl font-bold">{title}</h3>
            </div>
            <p className="mt-6">{description}</p>
          </>
        )}
      </div>
    </div>
  );
};

const FeaturesHeader = () => {
  return (
    <section className=" pt-32 md:pt-[200px] mb-20  md:mb-40 min-h-[74vh]  w-full  text-center relative px-4 md:px-[5%] xl:px-0 ">
      <img
        className="absolute left-6 top-16 md:left-80  md:top-32 w-8 md:w-auto"
        alt="star"
        src="/home/star.svg"
      />
      <img
        className="absolute w-8 md:w-auto right-40 -bottom-20"
        alt="star"
        src="/home/star.svg"
      />
      <img
        className="absolute right-20 top-16 md:top-32 md:right-80 w-10 md:w-16"
        alt="waves"
        src="/home/waves.svg"
      />
      <img
        className="absolute w-8 left-[660px] bottom-10"
        alt="asterisk"
        src="/home/asterisk.svg"
      />
      <img
        className="absolute w-8 right-12 bottom-64 md:top-96"
        alt="diamonds"
        src="/home/diamonds.svg"
      />
      <img
        className="absolute w-32 -right-16 -bottom-10 scale-50 md:scale-100"
        alt="espiral"
        src="/home/espiral.svg"
      />
      <img
        className="absolute w-10 left-72 -bottom-52 hidden md:block"
        alt="circles"
        src="/home/circles.svg"
      />
      <article className="max-w-7xl mx-auto flex flex-wrap md:flex-nowrap justify-between items-center mt-0 md:mt-20 gap-10 md:gap-20">
        <div className="md:text-left w-full md:w-[55%] text-center">
          <TextBlurEffect>
            <h2 className="text-4xl lg:text-6xl font-bold leading-tight">
              Todo lo que tu agente puede hacer en EasyBits
            </h2>
            <p className="text-xl lg:text-2xl mt-4">
              Cajas para ejecutar, web para investigar, archivos y datos para
              guardar, documentos y WhatsApp para entregar. Desde un solo MCP,
              en MXN.{" "}
            </p>
          </TextBlurEffect>
        </div>
        <div className="w-full md:w-[45%]">
          <img
            className="w-[90%] mx-auto md:w-full"
            src="/home/features-easybits.webp"
            alt="laptop con la pagina de easybits"
          />
        </div>
      </article>
    </section>
  );
};
