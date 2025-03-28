import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { animate, AnimatePresence, motion, useAnimate } from "motion/react";
import { ITEMS } from "./DashLayout.constants";
import { cn } from "~/utils/cn";
import Logo from "/icons/easybits-logo.svg";
import TextLogo from "/icons/easybits-logo-text.svg";

interface MenuItemProps {
  path: string;
  icon: ReactNode;
  iconSize?: number;
  title: string | ReactNode;
  isOpen?: boolean;
  isLogo?: boolean;
  end?: boolean;
  index?: number;
}

export const SideBar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scope, animate] = useAnimate();
  const handleMouseEnter = () => {
    animate(
      scope.current,
      {
        x: 220,
      },
      { bounce: 0.4 }
    );
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    animate(
      scope.current,
      {
        x: 0,
      },
      { bounce: 0.4 }
    );
    setIsOpen(false);
  };

  const handleClick = () => {
    animate(
      scope.current,
      {
        x: 0,
      },
      { bounce: 0.4 }
    );
    setIsOpen(false);
  };

  return (
    <section>
      <div className="fixed right-4 bottom-0 z-30 block md:hidden  ">
        <FoldMenu />
      </div>
      <div className="sticky h-screen  z-20 hidden md:block ">
        <div
          onMouseEnter={handleMouseEnter}
          className="w-20 bg-black pt-4 pb-6 h-screen box-border absolute top-0 z-10 flex flex-col justify-between "
        >
          <div className="w-full ">
            <div className="px-5 mb-4">
              <MenuItem
                path={"/"}
                icon={Logo}
                iconSize={52}
                title={
                  <img
                    src={TextLogo}
                    alt="easybits-text"
                    className="w-[104px] h-[40px]"
                  />
                }
                // isOpen={isOpen}
                isLogo
              />
            </div>
            <ul className="flex flex-col gap-6 py-6">
              {ITEMS.navItems.map((item, key) => (
                <MenuItem key={key} {...item} isOpen={isOpen} />
              ))}
            </ul>
            <div className="border-t border-white/15 w-full" />
            <ul className="flex flex-col gap-6 py-6">
              {ITEMS.sectionItems.map((item, key) => (
                <MenuItem key={key} {...item} isOpen={isOpen} />
              ))}
            </ul>
          </div>
          <ul className="flex flex-col gap-6 w-full mt-auto">
            {ITEMS.bottomItems.map((item, key) => (
              <MenuItem key={key} {...item} isOpen={isOpen} />
            ))}
          </ul>
        </div>
        <div
          ref={scope}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          className={cn(
            "w-48 bg-black pt-16 pb-6 h-full absolute  top-0 -left-52 flex flex-col justify-between  "
          )}
        >
          <div className="w-full ">
            <ul className="flex flex-col gap-6 py-6 pl-20">
              {ITEMS.navItems.map((item, key) => (
                <MenuItemFold key={key} {...item} />
              ))}
            </ul>
            <div className="border-t border-white/15 w-full" />
            <ul className="flex flex-col gap-6 py-6 pl-20 ">
              {ITEMS.sectionItems.map((item, key) => (
                <MenuItemFold key={key} {...item} />
              ))}
            </ul>
          </div>
          <ul className="flex flex-col gap-6 pl-20 w-full">
            {ITEMS.bottomItems.map((item, key) => (
              <MenuItemFold key={key} {...item} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

const FoldMenu = () => {
  const [isFold, setIsFold] = useState(false);
  const onClick = () => setIsFold(!isFold);
  return (
    <div className="flex flex-col  justify-end pb-4 items-end h-fit gap-4">
      <AnimatePresence>
        {isFold && (
          <>
            {ITEMS.navItems
              .concat(ITEMS.sectionItems)
              .concat(ITEMS.bottomItems)
              .filter(
                (item) =>
                  item.index !== 3 && item.index !== 6 && item.index !== 4
              )
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

const MenuItem = ({
  path = "",
  icon,
  iconSize,
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
        className={clsx("w-full flex items-center gap-4 h-[32px] relative ", {
          "px-7": !isLogo,
        })}
      >
        {isActive && (
          <motion.div
            layoutId="active-border"
            className={cn(
              "absolute -right-1 top-0 w-full h-full border-r-4 border-brand-500 rounded-sm",
              { "left-32 ": isOpen }
            )}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ type: "spring", bounce: 0 }}
          />
        )}
        {isLogo ? (
          <img src={icon} className={clsx(`w-[${iconSize || 32}px]`)} />
        ) : (
          <span>{icon}</span>
        )}
      </li>
    </NavLink>
  );
};

const MenuItemFold = ({ path = "", title, end }: MenuItemProps) => {
  const [isActive, setIsActive] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsActive(location.pathname === path);
  }, [location.pathname, path]);

  return (
    <NavLink end={end} to={path}>
      <li className="w-full gap-4 h-[32px] group">
        <motion.p
          className={cn(
            "text-white group-hover:text-brand-500 pt-1 transition-all",
            {
              "text-brand-500": isActive,
            }
          )}
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
      </li>
    </NavLink>
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
