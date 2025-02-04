import TextLogo from "~/assets/icons/easybits-logo-text.svg";
import Logo from "~/assets/icons/easybits-logo.svg";
import type { User } from "@prisma/client";
import { Link } from "react-router";

export const AuthNav = ({ user }: { user?: User }) => {
  return (
    <nav className="bg-black h-[80px] text-white flex justify-between lg:px-36 px-10 items-center border-b-2 border-[#757D8C] fixed inset-0">
      <div className="flex gap-3">
        <img src={Logo} alt="easybits" className="w-[53px]" />
        <img src={TextLogo} alt="easybits-text" className="w-[103px]" />
      </div>

      <div className="flex h-full items-center gap-9 content-center">
        {!user && (
          <>
            <Link to="/">Features</Link>
            <Link to="/">Planes</Link>
            <Link to="/">Blog</Link>
          </>
        )}

        {!user && (
          <div className="flex h-full items-center">
            <Link
              to="/login"
              className="px-8 border-l border-[#757D8C] h-full flex items-center"
            >
              Iniciar Sesión
            </Link>
            <Link
              to="/login"
              className="px-8 h-full bg-[#9870ED] text-black flex items-center"
            >
              Empezar
            </Link>
          </div>
        )}
        {user && (
          <div className="flex h-full items-center">
            <Link
              to="/dominio-personalizado"
              className="px-8 border-l border-[#757D8C] h-full flex items-center"
            >
              Configura tu marca
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
};
