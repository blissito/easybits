import TextLogo from "/icons/easybits-logo-text.svg";
import Logo from "/icons/easybits-logo.svg";
import type { User } from "@prisma/client";
import { Link } from "react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useWindowSize } from "~/hooks/useWindowSize";
import { FaBurger, FaXmark } from "react-icons/fa6";
import { BrutalButton } from "../common/BrutalButton";

export const AuthNav = ({ user }: { user?: User }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { width } = useWindowSize();
  const navItems = [
    {
      title: "Features",
      path: "/funcionalidades",
    },
    {
      title: "Planes",
      path: "/planes",
    },
    {
      title: "Blog",
      path: "/blog",
    },
  ];

  const toggleMenu = () => {
    if (isOpen) {
      setIsOpen(false);
      animate("#drawer", { y: "-100%" }, { duration: 0.5, type: "tween" });
    } else {
      setIsOpen(true);
      animate("#drawer", { y: "0%" }, { duration: 0.5, type: "tween" });
    }
  };

  const [scope, animate] = useAnimate();

  return (
    <header
      ref={scope}
      className=" z-50 bg-black h-14 md:h-[80px] px-4 md:px-[5%] xl:px-0  border-b-[1px] border-white/30 fixed inset-0"
    >
      <nav className=" max-w-7xl z-[70] relative mx-auto h-14 md:h-[80px] text-white flex justify-between items-center ">
        <Link to="/">
          <div className="flex gap-3">
            <img src={Logo} alt="easybits" className="w-12" />
            <img
              src={TextLogo}
              alt="easybits-text"
              className="w-28 hidden md:block"
            />
          </div>
        </Link>
        <div className="h-full items-center content-center hidden md:flex">
          {!user && (
            <div className=" flex justify-center items-center h-full">
              {navItems.map(({ title, path }, key) => (
                <Link
                  key={key}
                  to={path}
                  className="w-28 hover:text-black hover:border-b-[1px] hover:border-black  hover:bg-white h-full grig place-content-center text-center transition-all "
                >
                  {title}
                </Link>
              ))}
            </div>
          )}

          {!user && (
            <div className="flex h-full items-center">
              <Link
                to="/login"
                className="px-8 border-l border-white/30 h-full flex items-center  hover:text-black border-b hover:border-black  hover:bg-white"
              >
                Iniciar Sesión
              </Link>
              <Link to="/login" className="h-full border-x border-white/30">
                <motion.button
                  initial={{ borderRadius: "0px" }}
                  whileHover={{ borderRadius: "199px" }}
                  whileTap={{ borderRadius: "199px" }}
                  transition={{ type: "tween" }}
                  className="bg-brand-500 w-40 h-full font-medium text-black "
                >
                  Empezar
                </motion.button>
              </Link>
            </div>
          )}
          {user && (
            <div className="flex h-full items-center">
              <Link
                to="/dash"
                className="px-8 border-l border-grayLight h-full flex items-center"
              >
                Panel de control
              </Link>
              <Link
                to="/dominio-personalizado"
                className="px-8 border-l border-grayLight h-full flex items-center"
              >
                Configura tu marca
              </Link>
            </div>
          )}
        </div>
        <Burger onClick={toggleMenu} isOpen={isOpen} />
      </nav>
      <motion.div
        id="drawer"
        style={{
          y: "-100%",
        }}
        className="bg-black pb-6 inset-0 w-full h-fit absolute border-b-[1px] border-b-white/20"
      >
        <div className="text-center mt-20 px-6 ">
          <ul className="bg-black p-4 flex-col">
            {navItems.map(({ title, path }, key) => (
              <Link to={path} key={key}>
                <li className="h-[80px] text-xl text-white">{title}</li>
              </Link>
            ))}
            <Link to="/" key="comunidad">
              <li className="h-[80px] text-white text-xl">Comunidad</li>
            </Link>
            <Link to="/login" key="account">
              <li className="h-[80px] text-white text-xl">Iniciar sesión</li>
            </Link>
          </ul>
          <BrutalButton className="mx-auto" link="/contacto">
            Empezar
          </BrutalButton>
        </div>
      </motion.div>
    </header>
  );
};

const Burger = ({
  isOpen,
  onClick,
}: {
  isOpen: boolean;
  onClick: () => void;
}) => {
  const [scope, animate] = useAnimate();
  useEffect(() => {
    if (isOpen) {
      animate("#top", { rotateZ: -135, y: 6, backgroundColor: "white" });
      animate("#bottom", { rotateZ: 135, y: -5, backgroundColor: "white" });
    } else {
      animate("#top", { rotateZ: 0, y: 0, backgroundColor: "white" });
      animate("#bottom", { rotateZ: 0, y: 0, backgroundColor: "white" });
    }
  }, [isOpen]);
  return (
    <button
      onClick={onClick}
      ref={scope}
      className="flex md:hidden flex-col gap-2 relative "
    >
      <div id="top" className=" w-8 h-[3px]  rounded-full"></div>
      <div id="bottom" className="w-8 h-[3px]  rounded-full"></div>
    </button>
  );
};
