import clsx from "clsx";
import Logo from "~/assets/icons/easybits-logo.svg";
import { useState, type ReactNode } from "react";
import TextLogo from "~/assets/icons/easybits-logo-text.svg";
import { IoIosRocket } from "react-icons/io";
import { Link, Links } from "react-router";
import { LuPanelRightClose, LuPanelLeftClose } from "react-icons/lu";
import { AiOutlineBarChart } from "react-icons/ai";
import { FaBoxOpen } from "react-icons/fa";
import { FaLaptopCode } from "react-icons/fa";
import { TbMoneybag } from "react-icons/tb";
import { MdPeopleAlt } from "react-icons/md";
import { BsBagCheck } from "react-icons/bs";
import { VscSignOut } from "react-icons/vsc";

import { FaUser } from "react-icons/fa";

export default function ProfileLayout({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState<Boolean>(false);
  const navItems = [
    { Icon: IoIosRocket, path: "/", title: "!Empieza ya!" },
    { Icon: AiOutlineBarChart, path: "/", title: "Estadísticas" },
    { Icon: FaBoxOpen, path: "/", title: "Assets" },
    { Icon: FaLaptopCode, path: "/", title: "Mi tienda" },
    { Icon: TbMoneybag, path: "/", title: "Ventas" },
    { Icon: MdPeopleAlt, path: "/", title: "Clientes" },
  ];

  const sectionItems = [{ Icon: BsBagCheck, path: "/", title: "Compras" }];

  const bottomItems = [
    { Icon: FaUser, path: "/", title: "Perfil" },
    { Icon: VscSignOut, path: "/", title: "Cerrar Sesión" },
  ];
  return (
    <main className="flex">
      <aside
        className={clsx(
          "bg-black h-screen text-white flex flex-col justify-between items-center transition-all py-6",
          isOpen ? "w-[240px]" : "w-[88px]"
        )}
      >
        <div className="w-full">
          <div className="flex justify-center items-center mb-10 gap-4">
            <img src={Logo} alt="easybits" className="w-[52px] h-[47px]" />
            <img
              src={TextLogo}
              alt="easybits-text"
              className={clsx(
                "w-[103px] h-[39px]",
                isOpen ? "block" : "hidden"
              )}
            />
          </div>
          <ul className="flex flex-col gap-6">
            {navItems.map(({ title, Icon, path }) => (
              <Link to={path}>
                <li className="w-full flex justify-start items-center gap-4 px-6">
                  <Icon size={32} />
                  {title && (
                    <p className={clsx("", isOpen ? "block" : "hidden")}>
                      {title}
                    </p>
                  )}
                </li>
              </Link>
            ))}
            <div className="border-t border-[#757D8C] w-full" />
            {sectionItems.map(({ title, Icon, path }) => (
              <Link to={path}>
                <li
                  className={clsx(
                    "w-full flex items-center gap-4 px-6",
                    isOpen ? "justify-start" : "justify-center"
                  )}
                >
                  <Icon size={32} />
                  {title && (
                    <p className={clsx("", isOpen ? "block" : "hidden")}>
                      {title}
                    </p>
                  )}
                </li>
              </Link>
            ))}
          </ul>
        </div>

        <ul className="flex flex-col gap-6 w-full">
          {bottomItems.map(({ title, Icon, path }) => (
            <Link to={path}>
              <li
                className={clsx(
                  "w-full flex items-center gap-4 px-6",
                  isOpen ? "justify-start" : "justify-center"
                )}
              >
                <Icon size={32} />
                {title && (
                  <p className={clsx("", isOpen ? "block" : "hidden")}>
                    {title}
                  </p>
                )}
              </li>
            </Link>
          ))}
          <div className="border-t border-[#757D8C] w-full" />
          <li
            onClick={() => setIsOpen((p) => !p)}
            className={clsx(
              "w-full flex items-center gap-4 px-6 justify-center cursor-pointer"
            )}
          >
            {isOpen ? <LuPanelLeftClose /> : <LuPanelRightClose />}
          </li>
        </ul>
      </aside>
      <section className="">{children}</section>
    </main>
  );
}
