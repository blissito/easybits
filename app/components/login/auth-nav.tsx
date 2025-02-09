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
    <header className="relative z-50">
      <nav className="bg-black h-16 md:h-[80px] text-white flex justify-between lg:px-36 px-10 items-center border-b-2 border-grayLight fixed inset-0">
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
        <div className="h-full items-center gap-9 content-center hidden md:flex">
          {!user && (
            <>
              {navItems.map(({ title, path }, key) => (
                <Link key={key} to={path}>
                  {title}
                </Link>
              ))}
            </>
          )}

          {!user && (
            <div className="flex h-full items-center">
              <Link
                to="/login"
                className="px-8 border-l border-grayLight h-full flex items-center"
              >
                Iniciar Sesión
              </Link>
              <Link
                to="/login"
                className="px-8 h-full bg-brand-500 text-black flex items-center"
              >
                Empezar
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
