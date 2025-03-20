import clsx from "clsx";
import { use, useEffect, useState, type ReactNode } from "react";
import Logo from "/icons/easybits-logo.svg";
import { NavLink, Outlet, useLocation } from "react-router";
import TextLogo from "/icons/easybits-logo-text.svg";
import { animate, AnimatePresence, motion, useAnimate } from "motion/react";
import { ITEMS } from "./DashLayout.constants";
import { cn } from "~/utils/cn";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "../DashLayout/+types/DashLayout";
import { GridBackground } from "../common/backgrounds/GridBackground";

interface MenuItemProps {
  path: string;
  icon: string;
  iconSize?: number;
  title: string | ReactNode;
  isOpen?: boolean;
  isLogo?: boolean;
  end?: boolean;
  index?: number;
}

export const loader = async ({ request }: Route.LoaderArgs) => ({
  user: await getUserOrRedirect(request),
});

export default function DashLayout({ loaderData }: Route.ComponentProps) {
  // const { user } = loaderData;
  const [isOpen, setIsOpen] = useState<boolean>(true);

  return (
    <main className="flex relative z-10 min-h-screen">
      <SideBar />
      {/* <GridBackground /> */}
      <Outlet />
    </main>
  );
}

const SideBar = () => {
  return (
    <section>
      <div className="absolute h-full right-4 bottom-0 z-50 block md:hidden">
        <FoldMenu />
      </div>
      <motion.div
        className="bg-black hidden md:flex sticky top-0 z-10 h-screen text-white  flex-col justify-between items-center transition-all py-8"
        // initial={{ width: isOpen ? 240 : 88 }}
        whileHover={{ width: 240 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        // onMouseEnter={() => setIsOpen(true)}
        // onMouseLeave={() => setIsOpen(true)}
        // @todo fixed for now
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
              // isOpen={isOpen}
              isLogo
            />
          </div>
          <ul className="flex flex-col gap-6 py-6">
            {ITEMS.navItems.map((item, key) => (
              <MenuItem
                key={key}
                {...item}

                // isOpen={isOpen}
              />
            ))}
          </ul>
          <div className="border-t border-white/15 w-full" />
          <ul className="flex flex-col gap-6 py-6">
            {ITEMS.sectionItems.map((item, key) => (
              <MenuItem
                key={key}
                {...item}

                // isOpen={isOpen}
              />
            ))}
          </ul>
        </div>
        <ul className="flex flex-col gap-6 w-full">
          {ITEMS.bottomItems.map((item, key) => (
            <MenuItem
              key={key}
              {...item}
              //  isOpen={isOpen}
            />
          ))}
        </ul>
      </motion.div>
    </section>
  );
};

const FoldMenu = () => {
  const [isFold, setIsFold] = useState(false);

  const onClick = () => {
    if (isFold) {
      setIsFold(false);
      animate("#drawer", { y: "-100%" }, { duration: 0.5, type: "tween" });
    } else {
      setIsFold(true);
      animate("#drawer", { y: "0%" }, { duration: 0.5, type: "tween" });
    }
  };
  return (
    <div className="flex flex-col justify-end pb-4 items-end h-full gap-4 ">
      <AnimatePresence>
        {isFold && (
          <>
            {ITEMS.navItems
              .concat(ITEMS.sectionItems)
              .concat(ITEMS.bottomItems)
              .filter((item) => item.index !== 3)
              .map((item, key) => (
                <FoldMenuItem key={key} {...item} />
              ))}{" "}
          </>
        )}
      </AnimatePresence>
      <div className="w-12 h-12 bg-black rounded-full ">
        <DashBurger onClick={onClick} isFold={isFold} />
      </div>
    </div>
  );
};

const FoldMenuItem = ({
  path = "",
  icon,
  iconSize,
  end,
  index = 1,
}: MenuItemProps) => {
  return (
    <NavLink end={end} to={path}>
      <motion.button
        initial={{ filter: "blur(4px)", y: 0, opacity: 0 }}
        animate={{ filter: "blur(0px)", y: -10, opacity: 1 }}
        exit={{ filter: "blur(4px)", y: 0, opacity: 0 }}
        transition={{ delay: 0.08 * index }}
        className="w-12 h-12 rounded-full bg-black grid place-content-center "
      >
        {icon}
      </motion.button>
    </NavLink>
  );
};

const DashBurger = ({
  isFold,
  onClick,
}: {
  isFold?: boolean;
  onClick?: () => void;
}) => {
  const [scope, animate] = useAnimate();
  useEffect(() => {
    if (isFold) {
      animate("#top", { rotateZ: -135, y: 6, backgroundColor: "white" });
      animate("#bottom", { rotateZ: 135, y: -5, backgroundColor: "white" });
    } else {
      animate("#top", { rotateZ: 0, y: 0, backgroundColor: "white" });
      animate("#bottom", { rotateZ: 0, y: 0, backgroundColor: "white" });
    }
  }, [isFold]);
  return (
    <button
      onClick={onClick}
      ref={scope}
      className="flex w-full h-full  items-center justify-center flex-col gap-2 relative "
    >
      <div id="top" className=" w-8 h-[3px]  rounded-full"></div>
      <div id="bottom" className="w-8 h-[3px]  rounded-full"></div>
    </button>
  );
};

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
  const location = useLocation();

  useEffect(() => {
    setIsActive(location.pathname === path);
  }, [location.pathname, path]);

  return (
    <NavLink end={end} to={path}>
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
        {isLogo ? (
          <img src={icon} className={clsx(`w-[${iconSize || 32}px]`)} />
        ) : (
          <span>{icon}</span>
        )}
        {title && (
          <AnimatePresence initial={false}>
            {isOpen ? (
              <motion.p
                className={cn({
                  "text-brand-500 bg-red-800": isActive,
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
