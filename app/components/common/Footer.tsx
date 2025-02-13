import { FaFacebook, FaYoutube } from "react-icons/fa";
import { RiTwitterXFill } from "react-icons/ri";
import { AiFillInstagram } from "react-icons/ai";
import { useRef, useState } from "react";
import { motion } from "motion/react";

export const Footer = () => {
  const ref = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  return (
    <section className="bg-black">
      <div className="border-b-[1px] border-b-white/20 h-10 md:h-20 mx-4 md:mx-[5%] xl:mx-0">
        <div className="h-full max-w-7xl border-x-[1px] border-x-white/20 mx-auto"></div>
      </div>
      <div className="border-y-[1px] border-y-white/20 h-20 md:h-40 w-full  ">
        <div className="h-full max-w-7xl border-x-[1px] border-x-white/20 mx-auto px-4 md:px-[5%] xl:px-0">
          <motion.button
            initial={{ borderRadius: "0px" }}
            whileHover={{ borderRadius: "199px" }}
            whileTap={{ borderRadius: "199px" }}
            transition={{ type: "tween" }}
            className="bg-brand-500 w-full h-full  text-3xl md:text-5xl lg:text-[80px] font-medium "
          >
            Empezar gratis
          </motion.button>
        </div>
      </div>
      <div className="border-b-[1px] border-b-white/20 h-20 md:h-40 px-4 md:px-[5%] xl:px-0">
        <div className="h-full max-w-7xl border-x-[1px] border-x-white/20 mx-auto flex">
          <motion.div
            initial={{ borderRadius: "0px", borderColor: "#333333" }}
            whileHover={{ borderRadius: "199px", borderColor: "white" }}
            whileTap={{ borderRadius: "199px", borderColor: "white" }}
            transition={{ type: "tween" }}
            className="flex gap-4 items-center justify-center bg-transparent text-white w-[50%] border-[1px]  h-full  text-2xl font-light "
          >
            <img src="/demo.svg" className="w-12 md:w-16" alt="demo" />
            <div className="text-left flex flex-col gap-0">
              <p className="mb-0 text-lg md:text-2xl">Agendar demo</p>
              <span className="text-white/60  text-sm font-light underline">
                Ver disponibilidad
              </span>
            </div>
          </motion.div>
          <motion.div
            initial={{ borderRadius: "0px", borderColor: "#333333" }}
            whileHover={{ borderRadius: "199px", borderColor: "white" }}
            whileTap={{ borderRadius: "199px", borderColor: "white" }}
            transition={{ type: "tween" }}
            className="flex gap-4 items-center justify-center bg-transparent text-white w-[50%] border-[1px] border-white/20 h-full text-2xl font-light "
          >
            <img src="/plans.svg" className="w-12 md:w-16" alt="planes" />
            <div className="text-left flex flex-col gap-0">
              <p className="mb-0 text-lg md:text-2xl">Conocer planes</p>
              <span className="text-white/60  text-sm font-light underline">
                Ver disponibilidad
              </span>
            </div>
          </motion.div>
        </div>
      </div>
      <div className="border-b-[1px] border-b-white/20 h-10 md:h-20 px-4 md:px-[5%] xl:px-0">
        <div className="h-full max-w-7xl border-x-[1px] border-x-white/20 mx-auto"></div>
      </div>
      <div className="border-b-[1px] border-b-white/20 h-fit px-4 md:px-[5%] xl:px-0  ">
        <div className="h-full max-w-7xl gap-y-10 md:gap-y-0 border-x-[1px] border-x-white/20 mx-aut py-12 md:py-20 px-4 mx-auto grid grid-cols-12">
          <div className="col-span-12 md:col-span-6">
            <h1 className="flex flex-wrap items-center text-2xl md:text-3xl text-white">
              <span> Suscríbete </span> <span> para recibir</span>
              <span> tips para aumentar </span> <span> tus ventas y </span>{" "}
              <span> crear tus assets</span>
              <img
                className="w-10 ml-3"
                src="/logo-white.svg"
                alt="logo blanco"
              />
            </h1>

            {/* <span className=" flex flex-wrap items-center">
              <span className="bg-red-600 text-white text-2xl md:text-3xl w-fit">
                Suscríbete para recibir tips para aumentar tus ventas y crear
                tus assets
              </span>

              <img src="/logo-white.svg" alt="logo blanco" />
            </span> */}
          </div>
          <div className="hidden md:block col-span-1"></div>
          <div className="col-span-12 md:col-span-2">
            <h3 className="text-white mb-3">Sobre Easybits</h3>
            <p className="text-metal ">Features</p>
            <p className="text-metal">Planes</p>
            <p className="text-metal">Blog</p>
            <p className="text-metal">Preguntas frecuentes</p>
          </div>
          <div className="hidden md:block col-span-1"></div>
          <div className="col-span-12 md:col-span-2">
            <h3 className="text-white mb-3">Síguenos</h3>
            <div className="flex gap-3">
              <FaFacebook className="text-metal text-2xl md:text-lg" />
              <FaYoutube className="text-metal text-2xl md:text-lg " />
              <RiTwitterXFill className="text-metal text-2xl md:text-lg" />
              <AiFillInstagram className="text-metal text-2xl md:text-lg" />{" "}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
