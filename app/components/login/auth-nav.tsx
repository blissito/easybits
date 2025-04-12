import TextLogo from "/icons/easybits-logo-text.svg";
import Logo from "/icons/easybits-logo.svg";
import type { User } from "@prisma/client";
import { Link } from "react-router";
import { useEffect, useState } from "react";
import { motion, useAnimate } from "motion/react";
import { BrutalButton } from "../common/BrutalButton";
import { FlipLetters } from "../animated/FlipLetters";
import { cn } from "~/utils/cn";

export const AuthNav = ({ user, noCTA }: { user?: User }) => {
  const [isOpen, setIsOpen] = useState(false);
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
      className={cn(
        "z-30",
        "bg-black h-14 md:h-20 md:px-0 border-b-[1px] border-white/30 fixed inset-0"
      )}
    >
      <nav className=" max-w-7xl z-[99] relative mx-auto h-14 md:h-[80px] text-white flex justify-between items-center px-4 md:px-0">
        <Link to="/">
          <div className="flex gap-3">
            <img src={Logo} alt="easybits" className="w-12" />
            <FlipLetters word="EasyBits" />
          </div>
        </Link>
        <div className="h-full items-center content-center hidden md:flex">
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
          {!noCTA && !user && (
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
            <div className="flex h-full items-center border-r-[1px] border-white/30">
              <Link
                to="/dash/assets"
                className="px-8 border-x border-white/30 h-full flex items-center  hover:text-black border-b hover:border-black  hover:bg-white"
              >
                Agregar asset
              </Link>
              <Link to="/dash">
                <motion.button
                  initial={{ borderRadius: "0px" }}
                  whileHover={{ borderRadius: "199px" }}
                  whileTap={{ borderRadius: "199px" }}
                  transition={{ type: "tween" }}
                  className="bg-brand-500 w-40 h-20 font-medium text-black  "
                >
                  Ir al Dashboard
                </motion.button>
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
        className="bg-black pb-8 inset-0 w-full h-fit absolute border-b-[1px] border-b-white/20"
      >
        <div className="text-center mt-16 px-6 flex flex-col ">
          <ul className="bg-black flex flex-col">
            {navItems.map(({ title, path }, key) => (
              <Link to={path} key={key}>
                <li className="h-16 grid place-content-center  text-xl text-white">
                  {title}
                </li>
              </Link>
            ))}
          </ul>{" "}
          <Link to="/" key="comunidad">
            <p className="h-16 grid place-content-center text-white text-xl">
              Comunidad
            </p>
          </Link>
          {!noCTA && !user && (
            <>
              <Link to="/login" key="account">
                <p className="h-16 grid place-content-center text-white text-xl w-full mb-4 ">
                  Iniciar sesión
                </p>
              </Link>
              <Link to="/login">
                <BrutalButton className="mx-auto" link="/contacto">
                  Empezar
                </BrutalButton>{" "}
              </Link>
            </>
          )}
          {user && (
            <>
              <Link to="/dash/assets" key="account">
                <p className="h-16 gird place-content-center text-white mb-4 text-xl ">
                  Agregar nuevo asset
                </p>
              </Link>
              <Link to="/dash">
                <BrutalButton className="mx-auto" link="/contacto">
                  Ir al Dashboard
                </BrutalButton>{" "}
              </Link>
            </>
          )}
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
