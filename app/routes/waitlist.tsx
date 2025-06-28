import { AuthNav } from "~/components/login/auth-nav";
import type { Route } from "./+types/blog";
import { Link } from "react-router";
import { FaFacebook, FaLinkedinIn, FaYoutube } from "react-icons/fa";
import { RiTwitterXFill } from "react-icons/ri";
import { AiFillInstagram } from "react-icons/ai";
export default function Waitlist() {
  return (
    <section className="overflow-hidden">
      <AuthNav noCTA />
      <section className="border-b-[2px] border-b-black min-h-svh grid place-content-center ">
        <div className="max-w-7xl mx-auto flex flex-col items-center px-4 md:px-[5%] xl:px-0">
          <img src="/images/logo-animation.gif" className="w-52 mx-auto mb-6" alt="logo" />
          <h2 className="text-3xl xl:text-5xl font-bold text-center leading-tight mb-4">
            Ya estás en la lista de espera de Easybits! 🚀
          </h2>
          <p className="text-xl xl:text-3xl font-semibold text-center text-iron leading-tight mb-4">
            Nos emociona que estés aquí porque estamos construyendo algo épico
            para creadores como tú.
          </p>
          <p className="text-xl xl:text-3xl font-semibold text-center text-iron leading-tight mb-4">
            Muy pronto te daremos acceso para que puedas probarlo antes que
            nadie.
          </p>
          <div>
            Síguenos
            <div className="flex gap-3 flex-wrap">
              <a
                href="https://www.facebook.com/profile.php?id=61574014173527"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaFacebook className="text-iron hover:text-brand-500 transition-all text-2xl md:text-xl" />{" "}
              </a>
              <a
                href="https://www.youtube.com/@EasyBitsCloud"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaYoutube className="text-iron hover:text-brand-500 transition-all text-2xl md:text-xl " />
              </a>
              <a
                href="https://x.com/EasyBitsCloud"
                target="_blank"
                rel="noopener noreferrer"
              >
                <RiTwitterXFill className="text-iron hover:text-brand-500 transition-all text-2xl md:text-xl" />
              </a>
              <a
                href="https://www.instagram.com/easybits.cloud/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <AiFillInstagram className="text-iron hover:text-brand-500 transition-all text-2xl md:text-xl" />{" "}
              </a>
              <a
                href="https://www.linkedin.com/company/easybitscloud/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaLinkedinIn className="text-iron hover:text-brand-500 transition-all text-2xl md:text-xl" />{" "}
              </a>
            </div>
          </div>
          <Link
            className="py-2 px-6 font-bold border-2 rounded-2xl my-10"
            to="/logout"
          >
            Cerrar sesión
          </Link>
        </div>
      </section>
    </section>
  );
}
