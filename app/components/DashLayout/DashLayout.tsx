import clsx from "clsx";
import { useState, type ReactNode } from "react";
import Logo from "/icons/easybits-logo.svg";
import { NavLink, Outlet } from "react-router";
import TextLogo from "/icons/easybits-logo-text.svg";
import { AnimatePresence, motion } from "motion/react";
import { ITEMS } from "./DashLayout.constants";
import { cn } from "~/utils/cn";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "../DashLayout/+types/DashLayout";

interface MenuItemProps {
  path: string;
  icon: string;
  iconSize?: number;
  title: string | ReactNode;
  isOpen: boolean;
  isLogo?: boolean;
  end?: boolean;
}

const MenuItem = ({
  path = "",
  icon,
  iconSize,
  title,
  isOpen,
  isLogo,
  end,
}: MenuItemProps) => {
  const [isActive, setIsActive] = useState(false);
  return (
    <NavLink
      end={end}
      className={({ isActive }) => {
        setIsActive(isActive);
        return undefined;
      }}
      to={path}
    >
      <li
        className={clsx("w-full flex items-center gap-4 h-[32px] relative", {
          "px-7": !isLogo,
        })}
      >
        {isActive && (
          <motion.div
            layoutId="active-border"
            className="absolute -right-1 top-0 w-full h-full border-r-4 border-brand-500 rounded-sm"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ type: "spring", stiffness: 100 }}
          />
        )}
        {/* @todo cómo le damos color? cambiamos imagen? o mejor svg con fill? (ya lo hackieeeee)*/}
        {isLogo ? (
          <img src={icon} className={clsx(`w-[${iconSize || 32}px]`)} />
        ) : (
          <div
            className={clsx(`w-[${iconSize || 32}px]`, {
              "bg-brand-500": isActive,
              "bg-white": !isActive,
            })}
            style={{
              WebkitMaskImage: `url('${icon}')`,
              maskImage: `url('${icon}')`,
              WebkitClipPath: `url('${icon}')`,
              width: `${iconSize || 32}px`,
              height: `${iconSize || 32}px`,
            }}
          />
        )}
        {title && (
          <AnimatePresence initial={false}>
            {isOpen ? (
              <motion.p
                className={cn({
                  "text-brand-500": isActive,
                })}
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
    </NavLink>
  );
};

export const loader = async ({ request }: Route.LoaderArgs) => ({
  user: await getUserOrRedirect(request),
});

export default function DashLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  const [isOpen, setIsOpen] = useState<boolean>(true);

  return (
    <main className="flex relative">
      <div className="pr-1">
        <motion.div
          className="bg-black h-screen fixed text-white flex flex-col justify-between items-center transition-all py-8"
          initial={{ width: isOpen ? 240 : 88 }}
          whileHover={{ width: 240 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(true)} // @todo fixed for now
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
                isLogo
              />
            </div>
            <ul className="flex flex-col gap-6 py-6">
              {ITEMS.navItems.map((item, key) => (
                <MenuItem key={key} {...item} isOpen={isOpen} />
              ))}
            </ul>
            <div className="border-t border-grayLight w-full" />
            <ul className="flex flex-col gap-6 py-6">
              {ITEMS.sectionItems.map((item, key) => (
                <MenuItem key={key} {...item} isOpen={isOpen} />
              ))}
            </ul>
          </div>
          <ul className="flex flex-col gap-6 w-full">
            {ITEMS.bottomItems.map((item, key) => (
              <MenuItem key={key} {...item} isOpen={isOpen} />
            ))}
          </ul>
        </motion.div>
      </div>
      <div className="w-full ">
        <nav className="px-8 py-6 flex justify-end fixed w-full z-10">
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-lg font-semibold">
                {user.displayName || user.email?.split("@")[0]}
              </p>
              <p className="text-brand-gray">{user.email}</p>
            </div>
            <div className="w-[50px] h-[50px] rounded-full border-2 border-black overflow-hidden">
              <img className="object-contain" src={user.picture || Logo} />
            </div>
          </div>
        </nav>
        <motion.div
          initial={{ marginLeft: 240 }}
          animate={{ marginLeft: isOpen ? 240 : 88 }}
          transition={{ delay: 0.3, duration: 0.3, ease: "easeInOut" }}
          className=""
        >
          <Outlet />
        </motion.div>
      </div>
    </main>
  );
}
