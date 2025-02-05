import { Banners, Robot } from "~/components/common/Banner";
import { BrutalElement } from "~/components/common/BrutalElement";
import { Button } from "~/components/common/Button";
import { Footer } from "~/components/common/Footer";
import { Tag } from "~/components/common/Tag";
import { AuthNav } from "~/components/login/auth-nav";
import { cn } from "~/lib/utils";

export default function Home() {
  return (
    <section className="overflow-hidden w-full">
      <AuthNav />
      <Hero />
      <Banners>
        <>
          Pruébalo gratis por 30 días <Robot /> Pruébalo gratis por 30 días{" "}
          <Robot /> Pruébalo gratis por 30 días <Robot /> Pruébalo gratis por 30
          días <Robot />
          Pruébalo gratis por 30 días <Robot /> Pruébalo gratis por 30 días{" "}
          <Robot /> Pruébalo gratis por 30 días <Robot />
          Pruébalo gratis por 30 días <Robot /> Pruébalo gratis por 30 días{" "}
          <Robot /> Pruébalo gratis por 30 días
        </>
      </Banners>
      <Quote />
      <FirstBento />
      <SecondBento />
      <ThirdBento />
      <Comments />
      <Assets />
      <Invite />
      <Footer />
    </section>
  );
}

const Invite = () => {
  return (
    <section className="border-t-[1px] border-t-black py-20 md:py-40 px-4 md:px-[5%] xl:px-0">
      <div className="bg-[#96B894] max-w-7xl rounded-3xl text-3xl md:text-4xl lg:text-5xl font-bold mx-auto p-6 md:p-16 leading-snug">
        ¿Eres un creativo digital? Empieza a vender tu trabajo en EasyBits
        completamente gratis. Ahorra más de $100 USD mensuales en
        infraestructura y hazlo todo fácil desde EasyBits.
      </div>
    </section>
  );
};

const Assets = () => {
  return (
    <section className="max-w-7xl mx-auto py-20 md:py-40 px-4 md:px-[5%] xl:px-0">
      <h2 className="text-3xl md:text-5xl font-bold text-center mb-12 md:mb-20">
        Imagina todo lo que puedes vender en Easybits
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-6 md:gap-y-12">
        <Card className="bg-[#93E6EB]" />
        <Card className="bg-[#D4EB93]" />
        <Card className="bg-[#CDB8F9]" />
        <Card className="bg-[#DCE2F0]" />
        <Card className="bg-[#E0AC6E]" />
        <Card className="bg-[#FCCCBD]" />
        <Card className="bg-[#F7E1FD]" />
        <Card className="bg-[#B2DAD8]" />
        <Card className="bg-[#FADB6F]" />
      </div>
    </section>
  );
};

const Card = ({
  className,
  img,
  title,
  description,
  tags,
}: {
  className?: string;
  img?: string;
  title?: string;
  description?: string;
  tags?: string;
}) => {
  return (
    <div className="relative group inline-block col-span-1">
      {/* Shadow button */}
      <div className="absolute w-full lg:w-96 inset-0 h-56 bg-black rounded-xl transition-transform duration-300 scale-100 group-hover:translate-x-2 group-hover:translate-y-2 opacity-0 group-hover:opacity-100" />
      <div
        className={cn(
          "rounded-xl  bg-white  h-56 z-10  p-4 text-black text-lg w-full lg:w-96 border-black border-2 cursor-pointer relative transition-transform duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1",
          className
        )}
      >
        <img className="mb-3" alt="book" src="/default.svg" />
        <h3 className="text-xl font-bold">Libros, manuales o comics</h3>
        <p className="text-iron text-base mb-2">
          Lorem ipsum dolor sit amet consectetur. Posuere in quam. Posuere in
          quam.
        </p>
        <div className="flex gap-2">
          <Tag label="Sci-fi" />
          <Tag variant="outline" label="Sci-fi" />{" "}
        </div>
      </div>
    </div>
  );
};

const Comments = () => {
  return (
    <section className="bg-munsell min-h-[70vh] relative border-b-[1px] border-b-black px-4 md:px-[5%] xl:px-0 pb-28 pt-16 md:py-0">
      <img className="absolute left-72 top-12" src="/star.png" alt="star" />
      <img
        className="absolute right-8 md:right-20 bottom-6 md:bottom-12"
        src="/circle.svg"
        alt="circle"
      />
      <div className="max-w-7xl mx-auto items-center">
        <CommentItem />
      </div>
    </section>
  );
};

const CommentItem = ({}) => {
  return (
    <section className="flex items-center justify-between min-h-[70vh] relative flex-wrap-reverse md:flex-nowrap ">
      <div className="w-full md:w-[50%]">
        <p className="text-xl text-center md:text-left md:text-2xl lg:text-3xl xl:text-4xl font-bold">
          Lorem ipsum dolor sit amet consectetur adipisicing elit. Sed cum
          pariatur quam voluptas. Illum dolor dignissimos rerum explicabo facere
          inventore illo sunt consequuntur exercitationem, libero corrupti sequi
          voluptas provident rem.
        </p>
        <h4 className="text-base text-center md:text-left lg:text-xl font-semibold mt-8">
          {" "}
          Lorem ipsum dolor sit amet consectetur
        </h4>
        <div className="-bottom-10 md:bottom-20 absolute flex justify-center  w-full md:w-fit gap-2">
          <div className="w-6 h-6 rounded-full bg-white border-[1px] border-b-[2px] border-r-[2px] border-black"></div>
          <div className="w-6 h-6 rounded-full bg-black border-[1px] border-b-[2px] border-r-[2px] border-black"></div>
          <div className="w-6 h-6 rounded-full bg-black border-[1px] border-b-[2px] border-r-[2px] border-black"></div>
        </div>
      </div>
      <img
        className="w-[80%] mx-auto md:w-[40%] lg:w-auto mb-6 md:mb-0"
        src="/client.png"
        alt="user"
      />
    </section>
  );
};

const ThirdBento = () => {
  return (
    <section className="border-b-black border-b-[1px] lg:min-h-[680px] flex flex-wrap md:flex-nowrap">
      <div className="w-full md:w-[50%] bg-purple-600 h-[384px] md:h-[480px] lg:h-[680px]"></div>
      <div className="w-full md:w-[50%] flex flex-col justify-center p-10 md:px-12 xl:px-20 md:py-0">
        <h3 className="text-3xl lg:text-4xl font-bold">
          Recibe tus pagos fácilmente
        </h3>
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-8 ">
          Acepta distintas formas de pago que se adecúen a tu audiencia, incluso
          pagos internacionales seguros y rápidos.
        </p>
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Y recibe tus pagos directamente en tu cuenta bancaria cada 48 hrs.
        </p>
      </div>
    </section>
  );
};

const SecondBento = () => {
  return (
    <section className="border-b-black border-b-[1px] lg:min-h-[680px] flex flex-wrap-reverse md:flex-nowrap">
      <div className="w-full md:w-[50%] flex flex-col justify-center p-10 md:px-12 xl:px-20 md:py-0">
        <h3 className="text-3xl lg:text-4xl font-bold">
          Vende a quien quieras donde quieras{" "}
        </h3>
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-8 ">
          ¿Ya tienes clientes o un sequito de seguidores? Comparte tu tienda y
          permite que tu comunidad, seguidores o clientes compren fácilmente.
        </p>
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Y además, llega a más personas siendo parte de la comunidad EasyBits.
        </p>
      </div>
      <div className="w-full md:w-[50%] bg-purple-600 h-[384px] md:h-[480px] lg:h-[680px]"></div>
    </section>
  );
};

const FirstBento = () => {
  return (
    <section className="border-b-black border-b-[1px] lg:min-h-[680px] flex flex-wrap md:flex-nowrap">
      <div className="w-full md:w-[50%] bg-purple-600 h-[384px] md:h-[480px] lg:h-[680px] "></div>
      <div className="w-full md:w-[50%] flex flex-col justify-center p-10 md:px-12 xl:px-20 md:py-0 ">
        <h3 className="text-3xl lg:text-4xl font-bold">Vende lo que quieras</h3>
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-8 ">
          Desde cursos en video y libros hasta ilustraciones, fotografías,
          plantillas o lo que sea. ¡Sí, lo que sea!{" "}
        </p>

        <ItemList title="Tu set de fotografías" />
        <ItemList title="Tu libro de diseño" />
        <ItemList title="Tu paquete de ilustraciones" />
        <ItemList title="Tu curso de inglés" />
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Y más... mucho más.
        </p>
      </div>
    </section>
  );
};

const ItemList = ({ title }: { title: string }) => {
  return (
    <div className="flex gap-2 text-xl lg:text-2xl text-iron">
      <img alt="bullet" src="/bullet.svg" />
      <p className="font-cabin-regular font-light my-2">{title}</p>
    </div>
  );
};

const Quote = () => {
  return (
    <section className="border-b-[1px] border-b-black min-h-[60vh] md:min-h-[80vh] grid place-content-center">
      <div className="max-w-7xl mx-auto -mt-20 flex flex-col items-center px-4 md:px-[5%] xl:px-0">
        <img src="/logo-purple.svg" className="mx-auto" alt="logo" />
        <h2 className="text-3xl md:text-4xl xl:text-6xl font-bold text-center leading-tight">
          Únete a EasyBits y da de alta tu primer asset, personaliza los colores
          de tu sitio y comparte.
        </h2>
        <button className="text-xl mx-auto  mt-12 group ">
          Empieza ya{" "}
          <span className="text-2xl group-hover:animate-bounce"> &#8702;</span>
        </button>
      </div>
    </section>
  );
};

const Hero = () => {
  return (
    <section className="h-fit pt-24 pb-6 md:pb-0  md:min-h-[95vh] text-center md:text-left flex-wrap-reverse md:flex-nowrap flex justify-center items-center px-4 md:px-[5%] xl:px-0 w-full max-w-7xl mx-auto gap-6 lg:gap-28">
      <div className="w-full md:w-[50%]">
        <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-[80px] leading-tight font-bold">
          Vende tus assets digitales en línea{" "}
        </h1>
        <p className="text-iron text-xl lg:text-2xl xl:text-3xl font-extralight mb-6 md:mb-12 mt-2 md:mt-6">
          Crea una cuenta y consigue tu primer venta, vender tu trabajo digital
          es fácil en EasyBits.
        </p>
        <Button bgColor="bg-brand-500" size="large">
          ¡Empezar!
        </Button>
      </div>
      <div className="w-full md:w-[40%] relative">
        <img className="absolute" alt="star" src="/hero/star.svg" />
        <img
          className="absolute -left-[600px] bottom-0"
          alt="star"
          src="/hero/star.svg"
        />
        <img
          className="absolute bottom-0 -left-8 -rotate-12"
          alt="line"
          src="/hero/line.svg"
        />
        <div className="absolute -left-10 bottom-40">
          <BrutalElement className="w-32 md:w-48 ">
            <img className="  w-full " src="/hero/example2.png" alt="avatar" />{" "}
          </BrutalElement>
        </div>
        <div className="absolute right-6 md:-right-10 -top-8">
          <BrutalElement className="w-24 md:w-48  ">
            <img
              className="  w-full "
              src="/hero/example1.png"
              alt="page example"
            />{" "}
          </BrutalElement>
        </div>
        <div className="absolute -right-10 bottom-8">
          <BrutalElement className="w-32 md:w-48  ">
            <img
              className="  w-full "
              src="/hero/example3.png"
              alt="share screen"
            />{" "}
          </BrutalElement>
        </div>
        <img
          className="w-[65%] md:w-full mx-auto -mt-12"
          alt="platform features"
          src="/hero-img.png"
        />
      </div>
    </section>
  );
};
