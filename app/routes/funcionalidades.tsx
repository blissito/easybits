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
import { FaUsers } from "react-icons/fa";
import {
  MdOutlineStorage,
  MdStorefront,
  MdVideogameAsset,
} from "react-icons/md";
import { CgWebsite } from "react-icons/cg";
import { RiDiscountPercentLine } from "react-icons/ri";
import { AiOutlineApi } from "react-icons/ai";

export default function Blog() {
  return (
    <section>
      <AuthNav />
      <div className="overflow-hidden">
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
      <FeaturesList />
      <div className="px-4 md:px-[5%] xl:px-0">
        <SuscriptionBox className="w-full max-w-7xl my-20 md:my-40 " />{" "}
      </div>
      <Footer />
    </section>
  );
}

const FeaturesList = () => {
  return (
    <section className="max-w-7xl mx-auto gap-12 md:gap-20 grid grid-cols-1 lg:grid-cols-9 mt-20 md:mt-32 px-4 md:px-[5%] xl:px-0 ">
      <div className="relative lg:sticky top-0 lg:top-40 h-fit w-full col-span-1 lg:col-span-4">
        <h2 className="text-4xl md:text-5xl xl:text-7xl font-bold leading-snug mb-6 md:mb-12 relative">
          Prueba EasyBits. ¡No te vas a arrepentir!
          <img
            className="w-12 xl:w-16 absolute right-10 top-48 md:left-56 md:top-12 lg:right-24 lg:top-[94px] xl:left-80  xl:top-[150px]"
            src="/hero/man.svg"
          />
        </h2>
        <BrutalButton>¡Empezar gratis!</BrutalButton>
      </div>
      <div className="col-span-1 lg:col-span-5">
        <div className="border-x-[2px] border-black h-6 sticky top-0"></div>
        <Card
          icon={<MdVideogameAsset />}
          title="Venta de assets digitales de todo tipo"
          description={
            <p>
              {" "}
              ¿Eres un creativo o profesional que tiene algo que compartir? No
              importa si eres diseñador, arquitecto, escritor o artista. Vende
              cualquier tipo de assets digitales, desde{" "}
              <span className="text-brand-500  font-bold">
                {" "}
                libros electrónicos, videos, audio y música, o cualquier otro
                archivo como PSD o AI.
              </span>
            </p>
          }
        />
        <div className="border-x-[2px] border-black h-6"></div>
        <Card
          icon={<PiPaintBrushBroad />}
          title="Personalización de landing pages"
          description="Crea y personaliza landig pages para cada uno de tus assets, agrega su propia galería de fotos y una descripción completa para atraer a más clientes. Comparte el link de tu asset directamente en redes sociales, correos o whats app. "
        />
        <div className="border-x-[2px] border-black h-6"></div>
        <Card
          icon={<CgWebsite />}
          title="Tu propio website de ventas"
          description={
            <p>
              <span className="text-brand-500  font-bold">
                Añade tu logotipo, foto de portada, cambia los colores y
                tipografías,
              </span>{" "}
              selecciona el tema dark o light y agrega tus redes sociales. Con
              un par de clics ten listo tu website completamente optimizado para
              para dispositivos móviles.
            </p>
          }
        />
        <div className="border-x-[2px] border-black h-6"></div>
        <Card
          icon={<RiDiscountPercentLine />}
          title="Administración de descuentos"
          description={
            <p>
              Crea{" "}
              <span className="text-brand-500  font-bold">
                descuentos para ocasiones especiales, para todos tus productos o
                para productos específicos{" "}
              </span>{" "}
              y administralos de forma fácil y sencilla desde tu dashboard.
              Utiliza los descuentos para interactuar con tus clientes y
              aumentar tus ventas.
            </p>
          }
        />
        <div className="border-x-[2px] border-black h-6"></div>
        <Card
          icon={<TbWorldWww />}
          title="Configuración de dominio"
          description={
            <p>
              Además del subdominio gratuito que EasyBits te ofrece, puedes
              <span className="text-brand-500  font-bold">
                agregar tu propio dominio
              </span>{" "}
              para fortalecer tu marca.
            </p>
          }
        />
        <div className="border-x-[2px] border-black h-6"></div>
        <Card
          icon={<MdOutlineStorage />}
          title="Almacenamiento de archivos"
          description="En la misma plataforma puedes almacenar tus archivos, puedes venderlos o no, establecerlos como públicos o privados, consumirlos desde otra plataforma e incluso puedes compartirlos y definir tokens de acceso limitado por 1 minto, 1 hora o 1 día. "
        />{" "}
        <div className="border-x-[2px] border-black h-6"></div>
        <Card
          icon={<AiOutlineApi />}
          title="API para archivos"
          description={
            <p>
              Conecta EasyBits a tu proyecto de desarrollo y{" "}
              <span className="text-brand-500  font-bold">
                {" "}
                usa la API para agregar, editar o eliminar archivos de forma
                fácil
              </span>
              , además de administrar la privacidad de cada uno (públicos o
              privados). EasyBits será tu mejor hosting de archivos.
            </p>
          }
        />{" "}
        <div className="border-x-[2px] border-black h-6"></div>
        <Card
          icon={<BiSupport />}
          title="Soporte en español"
          description="¿Dudas o preguntas? Nuestro equipo estará listo para ayudarte a través de nuestras redes sociales o contacto directo."
        />
        <div className="border-x-[2px] border-black h-6"></div>
        <Card
          icon={<FaUsers />}
          title="Acceso completo a la información de tus clientes"
          description={
            <p>
              ¿Quieres descarga los mails de tus cleintes para enviar un mail o
              crear una campaña de ADS? Descargalos cuando quieras.{" "}
              <span className="text-brand-500  font-bold">
                {" "}
                ¡Tus clientes! ¡Tu información!
              </span>
            </p>
          }
        />
        <div className="border-x-[2px] border-black h-6"></div>
        <Card
          icon={<MdStorefront />}
          title="Acceso a la comunidad EasyBits para aumentar tus ventas"
          description={
            <p>
              Aumenta tus ventas siendo parte de la comunidad EasyBits en donde
              miles de usuarios exploran y compran assets digitales.{" "}
              <span className="text-brand-500  font-bold">
                La comunidad es un escaparte más para tus assets sin ningún
                costo o comisión adicional.
              </span>
            </p>
          }
        />
        <div className="border-x-[2px] border-black h-6"></div>
      </div>
    </section>
  );
};

const Card = ({
  title,
  description,
  icon,
}: {
  title: string;
  description: ReactNode;
  icon: ReactNode;
}) => {
  return (
    <div className="border-[2px] border-black p-6 md:p-10">
      <div className="flex gap-3 items-center">
        <span className="text-4xl">{icon}</span>
        <h3 className="text-3xl font-bold">{title}</h3>
      </div>
      <p className="mt-12">{description}</p>
    </div>
  );
};

const FeaturesHeader = () => {
  return (
    <section className="pt-32 md:pt-[200px] mb-20  md:mb-40 text-center relative px-4 md:px-[5%] xl:px-0">
      <img
        className="absolute left-6 top-16 md:left-80  md:top-32 w-8 md:w-auto"
        alt="star"
        src="/hero/star.svg"
      />
      <img
        className="absolute w-8 md:w-auto right-40 -bottom-20"
        alt="star"
        src="/hero/star.svg"
      />
      <img
        className="absolute right-20 top-16 md:top-40 md:right-80 w-10 md:w-16"
        alt="waves"
        src="/hero/waves.svg"
      />
      <img
        className="absolute w-8 left-[480px] top-80"
        alt="asterisk"
        src="/hero/asterisk.svg"
      />
      <img
        className="absolute w-12 right-12 top-96"
        alt="diamonds"
        src="/hero/diamonds.svg"
      />
      <img
        className="absolute w-32 -left-16 bottom-0"
        alt="espiral"
        src="/hero/espiral.svg"
      />
      <img
        className="absolute w-10 left-72 -bottom-52 hidden md:block"
        alt="circles"
        src="/hero/circles.svg"
      />

      <h2 className="text-4xl lg:text-6xl font-bold">Funcionalidades</h2>
      <p className="text-iron text-xl md:text-2xl mt-4 md:mt-6">
        Comienza a vender tus productos en minutos
      </p>
      <article className="flex flex-wrap lg:flex-nowrap justify-center mt-12 md:mt-20 gap-12 lg:gap-0">
        <div className="border-[2px] border-black w-[90%] lg:w-[420px] rounded-lg pb-3 -rotate-6 bg-white">
          <div className="py-2 border-b-[2px] border-black mb-3 text-xl font-bold">
            Otras plataformas
          </div>
          <ItemList
            icon={<IoClose />}
            label="Comisiones poco claras de hasta el 30% por venta"
          />
          <ItemList
            icon={<IoClose />}
            label="Pocas opciones de personalización"
          />

          <ItemList icon={<IoClose />} label="Plazos forzosos de suscripción" />
          <ItemList
            icon={<IoClose />}
            label="Mensualidades a precios elevados"
          />
          <ItemList icon={<IoClose />} label="Formas de pago limitadas " />
          <ItemList icon={<IoClose />} label="Soporte solo en inglés" />
          <ItemList
            icon={<IoClose />}
            label="Sin acceso a la información de tus clientes "
          />
        </div>
        <div className="border-[2px] border-black w-[90%] lg:w-[420px] rounded-lg pb-3 rotate-6 bg-white overflow-hidden">
          <div className="py-2 border-b-[2px] border-black mb-3 text-xl font-bold bg-brand-500 ">
            Con EsyBits
          </div>
          <ItemList
            icon={<TbPigMoney />}
            label="Sin comisiones extra, el 4% por venta y nada más"
          />
          <ItemList
            icon={<PiPaintBrushBroad />}
            label="Personalización en cada una de tus landing pages"
          />
          <ItemList
            icon={<TbShoppingBag />}
            label="Diferentes formas de pago adoc al mercado mexicano"
          />
          <ItemList
            icon={<BiCommentDetail />}
            label="Plan Free para que puedas vender tu primer asset"
          />
          <ItemList
            icon={<BiHappy />}
            label="Soporte en español para nuestros usuarios"
          />
          <ItemList
            icon={<FaUsers />}
            label="Acceso completo y detallado de tus ventas y clientes"
          />
        </div>
      </article>
    </section>
  );
};

const ItemList = ({ icon, label }: { icon: ReactNode; label: string }) => {
  return (
    <div className="flex gap-2 items-start px-6 py-2 text-left">
      <span className="text-xl">{icon}</span>
      <p>{label}</p>
    </div>
  );
};
