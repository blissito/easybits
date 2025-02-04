import clsx from "clsx";
import { useState, type ReactNode } from "react";
import Logo from "~/assets/icons/easybits-logo.svg";
import { Link } from "react-router";
import TextLogo from "~/assets/icons/easybits-logo-text.svg";
import { AnimatePresence, motion } from "motion/react";
import { ITEMS } from "./ProfileLayout.constants";
import type { Route } from "../../+types/root";

interface MenuItemProps {
  path: string;
  icon: string;
  iconSize?: number;
  title: string | ReactNode;
  isOpen: boolean;
}

const MenuItem = ({ path, icon, iconSize, title, isOpen }: MenuItemProps) => {
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
                  transition: { delay: 0.3, duration: 0.3 },
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

export default function ProfileLayout({
  children,
  user,
}: {
  children: ReactNode;
  user: any;
}) {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <main className="flex relative">
      <motion.div
        className="bg-black h-screen fixed text-white flex flex-col justify-between items-center transition-all py-8"
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
            {ITEMS.navItems.map((item, key) => (
              <MenuItem key={key} {...item} isOpen={isOpen} />
            ))}
          </ul>
          <div className="border-t border-[#757D8C] w-full" />
          <ul className="flex flex-col gap-6 px-7 py-6">
            {ITEMS.sectionItems.map((item, key) => (
              <MenuItem key={key} {...item} isOpen={isOpen} />
            ))}
          </ul>
        </div>
        <ul className="flex flex-col gap-6 w-full px-7">
          {ITEMS.bottomItems.map((item, key) => (
            <MenuItem key={key} {...item} isOpen={isOpen} />
          ))}
        </ul>
      </motion.div>
      <div className="w-full">
        <nav className="px-8 py-6 flex justify-end fixed w-full">
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-lg font-semibold">
                {user.displayName || user.email?.split("@")[0]}
              </p>
              <p className="text-[#8391A1]">{user.email}</p>
            </div>
            <div className="w-[50px] h-[50px] rounded-full border-2 border-black overflow-hidden">
              <img className="object-contain" src={user.picture || Logo} />
            </div>
          </div>
        </nav>
        <motion.div
          initial={{ marginLeft: 88 }}
          animate={{ marginLeft: isOpen ? 240 : 88 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          {children}
        </motion.div>
      </div>
    </main>
  );
}
