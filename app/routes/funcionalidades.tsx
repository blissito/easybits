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
    title: "Monetiza tu trabajo creativo",
    description: "Échale un ojo a todo lo que puedes hacer con EasyBits",
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
            Crea una cuenta gratis <Robot /> Vende tu primer asset <Robot />{" "}
            Almacena tus archivos <Robot /> Crea una cuenta gratis <Robot />{" "}
            Vende tu primer asset <Robot /> Almacena tus archivos <Robot /> Crea
            una cuenta gratis <Robot /> Vende tu primer asset <Robot /> Almacena
            tus archivos <Robot /> Crea una cuenta gratis <Robot /> Vende tu
            primer asset <Robot /> Almacena tus archivos <Robot />
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
            ¿Qué puedes hacer
            <br /> en EasyBits?
          </h2>{" "}
        </div>
      </div>

      <div className=" mx-auto px-4 md:px-[5%] xl:px-[0] w-full pb-0 md:pb-40 max-w-7xl  overflow-hidden ">
        <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6  ">
          <Card
            icon={<MdVideogameAsset />}
            className="bg-sky"
            bgColor="bg-[#EBBBE9]"
            title="Vender assets digitales de todo tipo"
            description={
              <p>
                {" "}
                ¿Eres un creativo o profesional que tiene algo que compartir? No
                importa si eres diseñador, arquitecto, escritor o maestro. Vende
                todo tipo de assets digitales:{" "}
                <span className="text-[#457D7B]  font-bold">
                  {" "}
                  libros electrónicos, videos, audio y música, o cualquier otro
                  archivo como PSD o AI.
                </span>
              </p>
            }
          />

          <Card
            bgColor="bg-berry"
            icon={<PiPaintBrushBroad />}
            title="Personalizar tus landing pages"
            description={
              <p>
                Crea y personaliza landig pages para cada uno de tus assets,{" "}
                <span className="text-[#DF7CB0]  font-bold">
                  agrega su propia galería de fotos y una descripción completa
                  para atraer a más clientes.
                </span>{" "}
                Comparte el link de tu asset directamente en redes sociales, por
                correo o whats app.
              </p>
            }
          />

          <Card
            className="bg-[#ECD66E]"
            icon={<CgWebsite />}
            bgColor="bg-[#B9A8F3]"
            title="Crear tu propio website de ventas"
            description={
              <p>
                Con un par de clics ten listo tu website completamente
                optimizado para todos los dispositivos.&nbsp;
                <span className="text-[#9D771D]  font-bold">
                  Añade tu logotipo, foto de portada, cambia los colores y
                  personaliza la tipografía,
                </span>{" "}
                selecciona el tema y agrega tus redes sociales.
              </p>
            }
          />
          <Card
            bgColor="bg-lime"
            icon={<RiDiscountPercentLine />}
            title="Administrar descuentos (proximamente)"
            description={
              <p>
                Crea{" "}
                <span className="text-[#61AA46]  font-bold">
                  descuentos para ocasiones especiales, para todos tus productos
                  o para productos específicos{" "}
                </span>{" "}
                y adminístralos de forma fácil y rápida desde tu dashboard.
                Utiliza los descuentos para consentir a tus clientes y aumentar
                tus ventas.
              </p>
            }
          />
          <Card image="/images/kit.png" variant="fullImage" />
          <Card
            bgColor="bg-sea"
            icon={<TbWorldWww />}
            title="Configurar tu dominio"
            description={
              <p>
                Además del subdominio gratuito que EasyBits te ofrece, puedes
                &nbsp;
                <span className="text-[#76A5C0]  font-bold">
                  agregar tu propio dominio
                </span>{" "}
                y fortalecer tu marca.
                <br />
                Pronto podrás comprar tu dominio directamente desde EasyBits.
              </p>
            }
          />
          <Card
            className="bg-[#B9A8F3]"
            bgColor="bg-[#ECD66E]"
            icon={<RiRobot2Fill className="text-[28px]" />}
            title="Usar AI para llenar la información de tus assets"
            description={
              <p>
                Con nuestro agente,
                <span className="text-[#5B567C]  font-bold">
                  {" "}
                  presenta tus assets de forma clara, creativa y con un toque de
                  personalidad
                </span>{" "}
                que atrape a tus futuros clientes desde el primer vistazo.
              </p>
            }
          />
          <Card
            icon={<SiGoogleanalytics className="text-[24px]" />}
            bgColor="bg-[#BFD0B3]"
            title="Integrar Google Analytics"
            description={
              <p>
                ¿Quieres medir conversiones específicas? Solo{" "}
                <span className="text-[#537C44]  font-bold">
                  pega tu ID de Google Analytics y comienza a recopilar datos
                  clave de inmediato.
                </span>
              </p>
            }
          />
          <Card
            className="bg-[#E8A787]"
            bgColor="bg-sky"
            icon={<GrAnalytics />}
            title="Descargar reportes de ventas"
            description={
              <p>
                Toda la información de tus ventas está disponible en tu
                dashboard.{" "}
                <span className="text-[#703524]  font-bold">
                  Descárgala cuando la necesites
                </span>
                .
              </p>
            }
          />
          <Card
            bgColor="bg-sky"
            icon={<FaUsers />}
            title="Tener acceso completo a la información de tus clientes"
            description={
              <p>
                ¿Quieres descargar los mails de tus clientes para enviar un mail
                o crear una campaña de ADS? Descárgalos cuando quieras.{" "}
                <span className="text-[#628FA9]  font-bold">
                  {" "}
                  ¡Tus clientes! ¡Tu información!
                </span>
              </p>
            }
          />
          <Card
            className="bg-[#B5E8A2]"
            icon={<MdStorefront />}
            bgColor="bg-[#E8A787]"
            title="Acceder a la comunidad EasyBits para aumentar tus ventas (proximamente)"
            description={
              <p>
                Aumenta tus ventas siendo parte de la comunidad EasyBits en
                donde cientos de usuarios exploran y compran assets digitales.{" "}
                <span className="text-[#537C44]  font-bold">
                  La comunidad es un escaparte más para tus assets sin ningún
                  costo o comisión adicional.
                </span>
              </p>
            }
          />
          <Card
            bgColor="bg-rose"
            icon={<SiGooglecontaineroptimizedos />}
            title="Optimizar tus archivos"
            description={
              <p>
                Puedes optimizar todo tu contenido en video bajo el{" "}
                <span className="text-[#C6478A]  font-bold">
                  protocolo HLS (HTTP Live Streaming),{" "}
                </span>{" "}
                el cuál permite adaptar la calidad del video a las condiciones
                de la red.
              </p>
            }
          />
          <Card
            className="bg-[#EFD7BC]"
            icon={<MdOutlineStorage />}
            title="Almacenar archivos"
            bgColor="bg-[#B9A8F3]"
            description={
              <p>
                En la misma plataforma puedes{" "}
                <span className="text-[#635C53]  font-bold">
                  almacenar tus archivos
                </span>
                , establecerlos como públicos o privados, consumirlos desde otra
                plataforma e incluso puedes compartirlos y definir tokens de
                acceso limitado por 1 minto, 1 hora o 1 día.
              </p>
            }
          />
          <Card
            bgColor="bg-munsell"
            icon={<AiOutlineApi />}
            title="Usar la API para archivos"
            description={
              <p>
                Conecta EasyBits a tu propia plataforma y{" "}
                <span className="text-[#B78E47]  font-bold">
                  {" "}
                  usa la API para agregar, editar o eliminar archivos de forma
                  fácil
                </span>
                , y además, administra la privacidad de cada uno (públicos o
                privados). EasyBits será tu mejor hosting de archivos.
              </p>
            }
          />
          <Card
            className="bg-[#EBBBE9]"
            icon={<BiSupport />}
            bgColor="bg-[#B5E8A2]"
            title="Recibir soporte en español"
            description={
              <p>
                ¿Dudas o preguntas?{" "}
                <span className="text-[#91466D]  font-bold">
                  {" "}
                  Nuestro equipo estará listo para ayudarte
                </span>{" "}
                a través de nuestras redes sociales o contacto directo.
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
        className={cn("border-2  h-full border-black p-6 md:p-10 ", {
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
              EasyBits: La herramienta para creadores digitales
            </h2>
            <p className="text-xl lg:text-2xl mt-4">
              Dedica más tiempo a crear y menos tiempo a administrar, crea tu
              asset y nosotros nos encargamos del resto: cobros, correos,
              entrega de archivos, seguridad y más.{" "}
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
