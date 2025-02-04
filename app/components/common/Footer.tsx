import { FaFacebook, FaYoutube } from "react-icons/fa";
import { RiTwitterXFill } from "react-icons/ri";
import { AiFillInstagram } from "react-icons/ai";

export const Footer = () => {
  return (
    <section className="bg-black">
      <div className="border-b-[1px] border-b-white/20 h-20">
        <div className="h-full max-w-7xl border-x-[1px] border-x-white/20 mx-auto"></div>
      </div>
      <div className="border-b-[1px] border-b-white/20 h-40 ">
        <div className="h-full max-w-7xl border-x-[1px] border-x-white/20 mx-auto">
          <button className="bg-brand-500 w-full h-full rounded-none transition-all text-[80px] font-medium hover:rounded-full">
            Empezar gratis
          </button>
        </div>
      </div>
      <div className="border-b-[1px] border-b-white/20 h-40 ">
        <div className="h-full max-w-7xl border-x-[1px] border-x-white/20 mx-auto flex">
          <button className="flex gap-4 items-center justify-center bg-transparent text-white w-[50%] border-[1px] border-white/20 h-full rounded-none transition-all text-2xl font-light hover:rounded-full">
            <img src="/demo.svg" className="w-16" alt="demo" />
            <div className="text-left flex flex-col gap-0">
              <p className="mb-0">Agendar demo</p>
              <span className="text-white/60  text-sm font-light underline">
                Ver disponibilidad
              </span>
            </div>
          </button>
          <button className="flex gap-4 items-center justify-center bg-transparent text-white w-[50%] border-[1px] border-white/20 h-full rounded-none transition-all text-2xl font-light hover:rounded-full">
            <img src="/plans.svg" className="w-16" alt="planes" />
            <div className="text-left flex flex-col gap-0">
              <p className="mb-0">Conocer planes</p>
              <span className="text-white/60  text-sm font-light underline">
                Ver disponibilidad
              </span>
            </div>
          </button>
        </div>
      </div>
      <div className="border-b-[1px] border-b-white/20 h-20">
        <div className="h-full max-w-7xl border-x-[1px] border-x-white/20 mx-auto"></div>
      </div>
      <div className="border-b-[1px] border-b-white/20 h-fit  ">
        <div className="h-full max-w-7xl border-x-[1px] border-x-white/20 mx-aut py-20 px-4 mx-auto grid grid-cols-12">
          <div className="col-span-6">
            <h4 className="text-white text-3xl flex">
              Suscríbete para recibir tips para aumentar tus ventas y crear tus
              assets{" "}
              <span className="inline">
                {" "}
                <img src="/logo-white.svg" alt="logo blanco" />
              </span>
            </h4>
          </div>
          <div className="col-span-1"></div>
          <div className="col-span-2">
            <h3 className="text-white mb-3">Sobre Easybits</h3>
            <p className="text-metal ">Features</p>
            <p className="text-metal">Planes</p>
            <p className="text-metal">Blog</p>
            <p className="text-metal">Preguntas frecuentes</p>
          </div>
          <div className="col-span-1"></div>
          <div className="col-span-2">
            <h3 className="text-white mb-3">Síguenos</h3>
            <div className="flex gap-3">
              <FaFacebook className="text-metal text-lg" />
              <FaYoutube className="text-metal text-lg " />
              <RiTwitterXFill className="text-metal text-lg" />
              <AiFillInstagram className="text-metal text-lg" />{" "}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
