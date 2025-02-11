import TextLogo from "/icons/easybits-logo-text.svg";
import Logo from "/icons/easybits-logo.svg";
import type { User } from "@prisma/client";
import { Link } from "react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useWindowSize } from "~/hooks/useWindowSize";
import { FaBurger, FaXmark } from "react-icons/fa6";

export const AuthNav = ({ user }: { user?: User }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { width } = useWindowSize();
  const navItems = [
    {
      title: "Features",
      path: "/features",
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

  return (
    <header className=" z-50 bg-black h-12 md:h-[80px] px-4 md:px-[5%] xl:px-0  border-b-[1px] border-white/30 fixed inset-0">
      <nav className=" max-w-7xl mx-auto h-12 md:h-[80px] text-white flex justify-between items-center ">
        <Link to="/">
          <div className="flex gap-3">
            <img src={Logo} alt="easybits" className="w-[53px]" />
            <img
              src={TextLogo}
              alt="easybits-text"
              className="w-[103px] hidden md:block"
            />
          </div>
        </Link>
        <div
          className="md:hidden cursor-pointer"
          onClick={() => setIsOpen((p) => !p)}
        >
          <FaBurger />
        </div>
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
      </nav>
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            className="w-full bg-white h-screen absolute z-10"
            initial={{ opacity: 0, x: width }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: width }}
            transition={{
              duration: 0.3,
            }}
          >
            <nav className="bg-black h-[80px] text-white flex justify-between px-10 items-center border-b-2 border-grayLight fixed inset-0">
              <img src={Logo} alt="easybits" className="w-[53px]" />
              <div
                className="cursor-pointer"
                onClick={() => setIsOpen((p) => !p)}
              >
                <FaXmark />
              </div>
            </nav>
            <ul className="bg-black h-[calc(100%-80px)] mt-[80px] p-4 flex-col">
              {navItems.map(({ title, path }, key) => (
                <Link to={path} key={key}>
                  <li className="h-[80px] text-white">{title}</li>
                </Link>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
};
