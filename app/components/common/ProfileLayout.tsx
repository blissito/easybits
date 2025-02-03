import clsx from "clsx";
import { useState, type ReactNode } from "react";
import Logo from "~/assets/icons/easybits-logo.svg";
import { Link } from "react-router";
import TextLogo from "~/assets/icons/easybits-logo-text.svg";
import RocketIcon from "~/assets/icons/rocket.svg";
import StatsIcon from "~/assets/icons/stonks.svg";
import AssetsIcon from "~/assets/icons/magic-box.svg";
import StoreIcon from "~/assets/icons/laptop-and-mobile.svg";
import MoneyIcon from "~/assets/icons/money.svg";
import BagIcon from "~/assets/icons/purchase.svg";
import UsersIcon from "~/assets/icons/users.svg";
import UserIcon from "~/assets/icons/profile.svg";
import LogoutIcon from "~/assets/icons/log-out.svg";
import { AnimatePresence, motion } from "motion/react";

const MenuItem = ({ path, icon, iconSize, title, isOpen }) => {
  return (
    <Link to={path}>
      <li className={clsx("w-full flex items-center gap-4 h-[32px]")}>
        <img className={clsx(`w-[${iconSize || 32}px]`)} src={icon} />
        {title && (
          <AnimatePresence initial={false}>
            {isOpen ? (
              <motion.p
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  transition: { delay: 0.3, duration: 0.5 },
                }}
                exit={{ opacity: 0, scale: 0 }}
              >
                {title}
              </motion.p>
            ) : null}
          </AnimatePresence>
        )}
      </li>
    </Link>
  );
};

export default function ProfileLayout({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState<Boolean>(false);
  const navItems = [
    { icon: RocketIcon, path: "/", title: "!Empieza ya!" },
    { icon: StatsIcon, path: "/", title: "Estadísticas" },
    { icon: AssetsIcon, path: "/", title: "Assets" },
    { icon: StoreIcon, path: "/", title: "Mi tienda" },
    { icon: MoneyIcon, path: "/", title: "Ventas" },
    { icon: UsersIcon, path: "/", title: "Clientes" },
  ];

  const sectionItems = [{ icon: BagIcon, path: "/", title: "Compras" }];

  const bottomItems = [
    { icon: UserIcon, path: "/", title: "Perfil" },
    { icon: LogoutIcon, path: "/", title: "Cerrar Sesión" },
  ];
  return (
    <main className="flex">
      <motion.div
        className="bg-black h-screen text-white flex flex-col justify-between items-center transition-all py-8"
        initial={{ width: 88 }}
        whileHover={{ width: 240 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
      >
        <div className="w-full">
          <div className="px-5 mb-4">
            <MenuItem
              path={"/"}
              icon={Logo}
              iconSize={52}
              title={
                <img
                  src={TextLogo}
                  alt="easybits-text"
                  className="w-[103px] h-[39px]"
                />
              }
              isOpen={isOpen}
            />
          </div>
          <ul className="flex flex-col gap-6 px-7 py-6">
            {navItems.map((item) => (
              <MenuItem {...item} isOpen={isOpen} />
            ))}
          </ul>
          <div className="border-t border-[#757D8C] w-full" />
          <ul className="flex flex-col gap-6 px-7 py-6">
            {sectionItems.map((item) => (
              <MenuItem {...item} isOpen={isOpen} />
            ))}
          </ul>
        </div>
        <ul className="flex flex-col gap-6 w-full px-7">
          {bottomItems.map((item) => (
            <MenuItem {...item} isOpen={isOpen} />
          ))}
        </ul>
      </motion.div>
      <section className="">{children}</section>
    </main>
  );
}
