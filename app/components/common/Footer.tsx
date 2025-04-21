import { FaFacebook, FaLinkedinIn, FaYoutube } from "react-icons/fa";
import { RiTwitterXFill } from "react-icons/ri";
import { AiFillInstagram } from "react-icons/ai";
import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Link } from "react-router";

export const Footer = () => {
  const ref = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  return (
    <section className="bg-black">
      <div className="border-b-[1px] border-b-white/20 h-10 md:h-20 mx-4 md:mx-[5%] xl:mx-0">
        <div className="h-full max-w-7xl border-x-[1px] border-x-white/20 mx-auto"></div>
      </div>
      <div className="border-y-[1px] border-y-white/20 h-20 md:h-40 w-full  ">
        <Link to="/login">
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
        </Link>
      </div>
      <div className="border-b-[1px] border-b-white/20 h-20 md:h-40 px-4 md:px-[5%] xl:px-0">
        <div className="h-full max-w-7xl border-x-[1px] border-x-white/20 mx-auto flex">
          <a
            href="https://calendly.com/brenda-formmy/easybits-demo"
            target="_blank"
            rel="noopener noreferrer"
            className="w-[50%]"
          >
            {" "}
            <motion.div
              initial={{ borderRadius: "0px", borderColor: "#333333" }}
              whileHover={{ borderRadius: "199px", borderColor: "white" }}
              whileTap={{ borderRadius: "199px", borderColor: "white" }}
              transition={{ type: "tween" }}
              className="flex gap-4 items-center justify-center bg-transparent text-white border-[1px]  h-full  text-2xl font-light "
            >
              {" "}
              <img src="/demo.svg" className="w-12 md:w-16" alt="demo" />
              <div className="text-left flex flex-col gap-0">
                <p className="mb-0 text-lg md:text-2xl">Agendar demo</p>
                <span className="text-white/60  text-sm font-light underline">
                  Ver disponibilidad
                </span>
              </div>{" "}
            </motion.div>
          </a>
          <Link to="/funcionalidades" className=" w-[50%]">
            <motion.div
              initial={{ borderRadius: "0px", borderColor: "#333333" }}
              whileHover={{ borderRadius: "199px", borderColor: "white" }}
              whileTap={{ borderRadius: "199px", borderColor: "white" }}
              transition={{ type: "tween" }}
              className=" flex gap-4 items-center group justify-center bg-transparent text-white w-full border-[1px] border-white/20 h-full text-2xl font-light "
            >
              <img src="/plans.svg" className="w-12 md:w-16" alt="planes" />
              <div className="text-left flex flex-col gap-0">
                <p className="mb-0 text-lg md:text-2xl">Escoge tu plan</p>
                <span className="text-white/60  text-sm font-light underline">
                  Comparar disponibilidad
                </span>
              </div>
            </motion.div>
          </Link>
        </div>
      </div>
      <div className="border-b-[1px] border-b-white/20 h-10 md:h-20 px-4 md:px-[5%] xl:px-0">
        <div className="h-full max-w-7xl border-x-[1px] border-x-white/20 mx-auto"></div>
      </div>
      <div className="border-b-[1px] border-b-white/20 h-fit px-4 md:px-[5%] xl:px-0  ">
        <div className="h-full max-w-7xl gap-y-10 md:gap-y-0 border-x-[1px] border-x-white/20 mx-aut py-12 md:py-20 px-4 mx-auto grid grid-cols-12">
          <div className="col-span-12 md:col-span-6">
            <h2 className="flex flex-wrap items-center text-2xl md:text-3xl text-white">
              <span> Suscríbete&nbsp; </span>{" "}
              <span> para recibir consejos&nbsp;</span>
              <span> de marketing &nbsp;</span> <span> y negocios &nbsp;</span>{" "}
              <span> para creadores</span>
              <img
                className="w-10 ml-3"
                src="/logo-white.svg"
                alt="logo blanco"
              />
            </h2>
            <div className="max-w-[500px] -pt-10 h-[134px]  overflow-y-hidden">
              <div className="-ml-4">
                <iframe
                  frameBorder="0"
                  id="formmy-iframe"
                  title="formmy"
                  width="100%"
                  height="240"
                  src="https://www.formmy.app/embed/67eeea09195dc4d556cb765d"
                  style={{ margin: "0 auto", display: "block" }}
                ></iframe>
              </div>{" "}
            </div>
          </div>
          <div className="hidden md:block col-span-1"></div>
          <div className="col-span-12 md:col-span-2 flex flex-col gap-2">
            <h3 className="text-white mb-3">Sobre Easybits</h3>
            <Link to="/funcionalidades">
              <p className="text-white/50 hover:text-brand-500 transition-all">
                Features
              </p>
            </Link>
            <Link to="/planes">
              <p className="text-white/50 hover:text-brand-500 transition-all">
                Planes
              </p>
            </Link>
            <Link to="/blog">
              <p className="text-white/50 hover:text-brand-500 transition-all">
                Blog
              </p>
            </Link>
            <Link to="/planes">
              <p className="text-white/50 hover:text-brand-500 transition-all">
                Preguntas frecuentes
              </p>
            </Link>
            <Link to="/terminos-y-condiciones">
              <p className="text-white/50 hover:text-brand-500 transition-all">
                Términos y condiciones
              </p>
            </Link>
            <Link to="/aviso-de-privacidad">
              <p className="text-white/50 hover:text-brand-500 transition-all">
                Aviso de Privacidad
              </p>
            </Link>
          </div>
          <div className="hidden md:block col-span-1"></div>
          <div className="col-span-12 md:col-span-2">
            <h3 className="text-white mb-3">Síguenos</h3>
            <div className="flex gap-3 flex-wrap">
              <a
                href="https://www.facebook.com/profile.php?id=61574014173527"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaFacebook className="text-white/50 hover:text-brand-500 transition-all text-2xl md:text-xl" />{" "}
              </a>
              <a
                href="https://www.youtube.com/@EasyBitsCloud"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaYoutube className="text-white/50 hover:text-brand-500 transition-all text-2xl md:text-xl " />
              </a>
              <a
                href="https://x.com/EasyBitsCloud"
                target="_blank"
                rel="noopener noreferrer"
              >
                <RiTwitterXFill className="text-white/50 hover:text-brand-500 transition-all text-2xl md:text-xl" />
              </a>
              <a
                href="https://www.instagram.com/easybits.cloud/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <AiFillInstagram className="text-white/50 hover:text-brand-500 transition-all text-2xl md:text-xl" />{" "}
              </a>
              <a
                href="https://www.linkedin.com/company/easybitscloud/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaLinkedinIn className="text-white/50 hover:text-brand-500 transition-all text-2xl md:text-xl" />{" "}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
