import { useEffect, useState, type ReactNode, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { AnimatePresence, motion, useAnimate } from "motion/react";
import { ITEMS } from "./DashLayout.constants";
import { cn } from "~/utils/cn";
import Logo from "/logo-purple.svg";

interface MenuItemProps {
  path?: string;
  icon?: ReactNode;
  iconSize?: number;
  title?: string | ReactNode;
  isOpen?: boolean;
  isLogo?: boolean;
  end?: boolean;
  index?: number;
  isCurrentActive?: boolean;
}

export const SideBar = () => {
  return (
    <>
      <section className="fixed right-4 bottom-16 z-20 block md:hidden  ">
        <FoldMenu />
      </section>
      <SideBarWeb />
    </>
  );
};

const SideBarWeb = () => {
  const location = useLocation();
  return (
    <section className="w-20  h-full hidden md:flex bg-black border-r-[2px] border-black fixed z-40 py-2 flex-col gap-4">
      <SideBarItem isLogo />
      <ul className="flex flex-col gap-3 pt-2 pb-0 items-center">
        {ITEMS.navItems.map((item, key) => (
          <SideBarItem
            isCurrentActive={
              item.title === "Assets"
                ? location.pathname.includes(item.path)
                : item.title === "¡Empieza ya!"
                ? location.pathname === "/dash" ||
                  location.pathname === "/dash/" // hack 🤓
                : undefined
            }
            key={key}
            {...item}
          />
        ))}
      </ul>
      <hr className="bg-white opacity-20 h-[1px] w-full" />
      <ul className="flex flex-col gap-3 py-0 items-center">
        {ITEMS.sectionItems.map((item, key) => (
          <SideBarItem key={key} {...item} />
        ))}
      </ul>
      <ul className="flex flex-col items-center pb-0 gap-3 w-full mt-auto">
        {ITEMS.bottomItems.map((item, key) => (
          <SideBarItem key={key} {...item} />
        ))}
      </ul>
    </section>
  );
};

const SideBarItem = ({
  isCurrentActive = false,
  title,
  path = "/inicio",
  icon,
  isLogo,
}: MenuItemProps) => {
  const location = useLocation();
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    setIsActive(isCurrentActive || location.pathname === path);
  }, [location.pathname, path]);

  const [scope, animate] = useAnimate();
  const handleMouseEnter = () => {
    animate(scope.current, { opacity: 1, scale: 1 });
  };

  const handleMouseLeave = () => {
    animate(scope.current, { opacity: 0, scale: 0.0 });
  };
  return (
    <Link to={path}>
      <div className="relative group w-full ">
        <div
          className="w-full flex justify-center relative"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isLogo ? (
            <img className="w-14 mx-auto py-4" src={Logo} alt="EasyBits Logo" />
          ) : (
            <motion.div
              className={cn(
                "p-[6px] relative flex justify-center items-center hover:bg-white/15 rounded-lg"
              )}
            >
              {isActive ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ bounce: 2 }}
                  className="w-full h-full bg-brand-500 rounded-lg  absolute"
                ></motion.div>
              ) : null}
              <span className="relative z-20 pointer-events-none">{icon}</span>
            </motion.div>
          )}
        </div>{" "}
        {isLogo ? null : (
          <button
            ref={scope}
            className=" bg-white border scale-0 border-gray-200 absolute left-14 top-[6px] w-fit h-8 flex items-center rounded text-black px-2 opacity-0 "
          >
            <span className="whitespace-nowrap ">{title}</span>
          </button>
        )}
      </div>{" "}
    </Link>
  );
};

const FoldMenu = () => {
  const [isFold, setIsFold] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isFold) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsFold(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isFold]);

  const onClick = () => setIsFold(!isFold);
  return (
    <div ref={menuRef} className="flex flex-col  justify-end pb-4 items-end h-fit gap-2">
      <AnimatePresence>
        {isFold && (
          <>
            {ITEMS.navItems
              .concat(ITEMS.sectionItems)
              .concat(ITEMS.bottomItems)
              .filter(
                (item) =>
                  item.index !== 3  && item.index !== 4
              )
              .map((item, key) => (
                <FoldMenuItem key={key} {...item} />
              ))} {" "}
          </>
        )}
      </AnimatePresence>
      <div className="w-12 h-12 bg-black rounded-full ">
        <DashBurger onClick={onClick} isFold={isFold} />
      </div>
    </div>
  );
};

const FoldMenuItem = ({ path = "", icon, end, index = 1 }: MenuItemProps) => {
  return (
    <NavLink end={end} to={path} className="w-fit h-fit  flex items-center">
      <motion.button
        initial={{ filter: "blur(4px)", y: 10, opacity: 0 }}
        animate={{ filter: "blur(0px)", y: 0, opacity: 1 }}
        exit={{ filter: "blur(4px)", y: 10, opacity: 0 }}
        transition={{ delay: 0.04 * index }}
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

export const HeaderMobile = () => {
  return (
    <div className="w-full h-12 bg-black z-30 px-4 fixed flex items-center justify-center md:hidden">
      <Link to="/">
        <img alt="logo easybits" className="h-10" src={Logo} />
      </Link>
    </div>
  );
};
