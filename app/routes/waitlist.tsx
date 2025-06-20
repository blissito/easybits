import { AuthNav } from "~/components/login/auth-nav";
import type { Route } from "./+types/blog";
import { Link } from "react-router";
export default function Waitlist() {
  return (
    <section className="overflow-hidden">
      <AuthNav noCTA />
      <section className="border-b-[2px] border-b-black min-h-[100vh] grid place-content-center md:px-20">
        <div className="max-w-7xl mx-auto -mt-20 flex flex-col items-center px-4 md:px-[5%] xl:px-0">
          <img src="/logo-purple.svg" className="mx-auto mb-6" alt="logo" />
          <h2 className="text-3xl md:text-4xl xl:text-6xl font-bold text-center leading-tight mb-4">
            Ya estás en la lista de espera de Easybits! 🚀
          </h2>
          <p className="text-2xl md:text-3xl xl:text-5xl font-semibold text-center leading-tight mb-4">
            Nos emociona que estés aquí porque estamos construyendo algo épico
            para creadores como tú.
          </p>
          <p className="text-2xl md:text-3xl xl:text-5xl font-semibold text-center leading-tight">
            Muy pronto te daremos acceso para que puedas probarlo antes que
            nadie.
          </p>
          <Link
            to="https://www.linkedin.com/company/fixtergeek"
            className="text-xl mx-auto  mt-12 group "
          >
            Síguenos
            <span className="text-2xl group-hover:animate-bounce">
              {" "}
              &#8702;
            </span>
          </Link>
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
