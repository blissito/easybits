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
      <FirstBento />
      <Comments />
      <Assets />
      <Invite />
      <Footer />
    </section>
  );
}

const Invite = () => {
  return (
    <section className="border-t-[1px] border-t-black py-40">
      <div className="bg-[#96B894] max-w-7xl rounded-3xl text-5xl font-bold mx-auto p-16 leading-snug">
        ¿Eres un creativo digital? Empieza a vender tu trabajo en EasyBits
        completamente gratis. Ahorra más de $100 USD mensuales en
        infraestructura y hazlo todo fácil desde EasyBits.
      </div>
    </section>
  );
};

const Assets = () => {
  return (
    <section className="max-w-7xl mx-auto py-40 px-4 md:px-[5%] xl:px-0">
      <h2 className="text-5xl font-bold text-center mb-20">
        Imagina todo lo que puedes vender en Easybits
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
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
      <div className="absolute w-96 inset-0 h-56 bg-black rounded-xl transition-transform duration-300 scale-100 group-hover:translate-x-2 group-hover:translate-y-2 opacity-0 group-hover:opacity-100" />
      <div
        className={cn(
          "rounded-xl w-full bg-white  h-56 z-10  p-4 text-black text-lg  md:w-96 border-black border-2 cursor-pointer relative transition-transform duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1",
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
    <section className="bg-munsell min-h-[70vh] relative border-b-[1px] border-b-black">
      <img className="absolute left-72 top-12" src="/star.png" alt="star" />
      <img
        className="absolute right-20 bottom-12"
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
    <section className="flex items-center justify-between min-h-[70vh] relative ">
      <div className="w-[50%]">
        <p className="text-4xl font-bold">
          Lorem ipsum dolor sit amet consectetur adipisicing elit. Sed cum
          pariatur quam voluptas. Illum dolor dignissimos rerum explicabo facere
          inventore illo sunt consequuntur exercitationem, libero corrupti sequi
          voluptas provident rem.
        </p>
        <h4 className="text-xl font-semibold mt-8">
          {" "}
          Lorem ipsum dolor sit amet consectetur
        </h4>
        <div className="bottom-20 absolute flex gap-2">
          <div className="w-6 h-6 rounded-full bg-white border-[1px] border-b-[2px] border-r-[2px] border-black"></div>
          <div className="w-6 h-6 rounded-full bg-black border-[1px] border-b-[2px] border-r-[2px] border-black"></div>
          <div className="w-6 h-6 rounded-full bg-black border-[1px] border-b-[2px] border-r-[2px] border-black"></div>
        </div>
      </div>
      <img src="/client.png" alt="user" />
    </section>
  );
};

const SecondBento = () => {
  return (
    <section className="border-b-black border-b-[1px] min-h-[680px] flex">
      <div className="w-full md:w-[50%] flex flex-col justify-center px-20">
        <h3 className="text-4xl font-bold">Vende lo que quieras</h3>
        <p className="text-iron text-2xl mt-4 mb-8 ">
          Desde cursos en video y libros hasta ilustraciones, fotografías,
          plantillas o lo que sea.{" "}
        </p>

        <ItemList title="Tu set de fotografías" />
        <ItemList title="Tu libro de diseño" />
        <ItemList title="Tu paquete de ilustraciones" />
        <ItemList title="Tu curso de inglés" />
        <p className="text-iron text-2xl mt-4 ">Y más... mucho más.</p>
      </div>
      <div className="w-full md:w-[50%] bg-purple-600 "></div>
    </section>
  );
};

const FirstBento = () => {
  return (
    <section className="border-b-black border-b-[1px] min-h-[680px] flex">
      <div className="w-full md:w-[50%] bg-purple-600 "></div>
      <div className="w-full md:w-[50%] flex flex-col justify-center px-20">
        <h3 className="text-4xl font-bold">Vende lo que quieras</h3>
        <p className="text-iron text-2xl mt-4 mb-8 ">
          Desde cursos en video y libros hasta ilustraciones, fotografías,
          plantillas o lo que sea.{" "}
        </p>

        <ItemList title="Tu set de fotografías" />
        <ItemList title="Tu libro de diseño" />
        <ItemList title="Tu paquete de ilustraciones" />
        <ItemList title="Tu curso de inglés" />
        <p className="text-iron text-2xl mt-4 ">Y más... mucho más.</p>
      </div>
    </section>
  );
};

const ItemList = ({ title }: { title: string }) => {
  return (
    <div className="flex gap-2 text-2xl text-iron">
      <img alt="bullet" src="/bullet.svg" />
      <p className="font-cabin-regular font-light my-2">{title}</p>
    </div>
  );
};

const Quote = () => {
  return (
    <section className="border-b-[1px] border-b-black min-h-[80vh] grid place-content-center">
      <div className="max-w-7xl mx-auto -mt-20 flex flex-col items-center">
        <img src="/logo-purple.svg" className="mx-auto" alt="logo" />
        <h2 className="text-6xl font-bold text-center leading-tight">
          Pon tus assets en venta en menos de 5 minutos. Crea una cuenta. Agrega
          tus assets. Y empieza a vender.
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
    <section className="h-fit pt-24  md:min-h-[95vh] text-center md:text-left flex-wrap-reverse md:flex-nowrap flex justify-center items-center px-4 md:px-[5%] lg:px-0 w-full max-w-7xl mx-auto gap-6 lg:gap-28">
      <div className="w-full md:w-[50%]">
        <h1 className="text-4xl  md:text-6xl lg:text-[80px] leading-tight font-bold">
          Vende tus assets digitales en línea{" "}
        </h1>
        <p className="text-iron text-xl md:text-2xl lg:text-3xl font-extralight mb-12 mt-6">
          Crea una cuenta y consigue tu primer venta, vender tu trabajo digital
          es fácil en EasyBits.
        </p>
        <Button variant="small">¡Empezar!</Button>
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
          <BrutalElement className="w-48 ">
            <img className="  w-full " src="/hero/example2.png" alt="avatar" />{" "}
          </BrutalElement>
        </div>
        <div className="absolute -right-10 -top-8">
          <BrutalElement className="w-48  ">
            <img
              className="  w-full "
              src="/hero/example1.png"
              alt="page example"
            />{" "}
          </BrutalElement>
        </div>
        <div className="absolute -right-10 bottom-8">
          <BrutalElement className="w-48  ">
            <img
              className="  w-full "
              src="/hero/example3.svg"
              alt="share screen"
            />{" "}
          </BrutalElement>
        </div>
        <img
          className="w-[80%] md:w-full mx-auto"
          alt="platform features"
          src="/hero-img.svg"
        />
      </div>
    </section>
  );
};
