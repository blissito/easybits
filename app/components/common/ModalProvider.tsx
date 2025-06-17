import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "~/utils/cn";
import { BrutalButtonClose } from "./BrutalButtonClose";
import { Avatar } from "./Avatar";
import { Link } from "react-router";
import { BrutalButton } from "./BrutalButton";
import { FaCheck } from "react-icons/fa";

export const ModalProvider = ({
  noCloseButton,
  children,
  mode = "overlay",
  isOpen,
  title,
  icon,
  onClose,
  className,
  containerClassName,
}: {
  noCloseButton?: boolean;
  className?: string;
  containerClassName?: string;
  onClose?: () => void;
  isOpen?: boolean;
  children?: ReactNode;
  title?: ReactNode;
  icon: string;
}) => {
  const keyDownHandler = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      onClose?.();
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      addEventListener("keydown", keyDownHandler);
    } else {
      document.body.style.overflow = "inherit";
      removeEventListener("keydown", keyDownHandler);
    }
    return () => {
      document.body.style.overflow = "inherit";
      removeEventListener("keydown", keyDownHandler);
    };
  }, [isOpen]);

  const getForModal = (type: string) => {
    switch (type) {
      case "exit":
        return {
          y: 10,
          filter: "blur(4px)",
          opacity: 0,
        };
      case "initial":
        return {
          y: 10,
          filter: "blur(3px)",
          opacity: 0,
        };
      case "animate":
        return {
          y: 0,
          filter: "blur(0px)",
          opacity: 1,
        };
    }
  };

  const getForDrawer = (type: string) => {
    switch (type) {
      case "exit":
        return {
          x: 10,
          filter: "blur(4px)",
          opacity: 0,
        };
      case "initial":
        return {
          x: 10,
          filter: "blur(4px)",
          opacity: 0,
        };
      case "animate":
        return {
          x: 0,
          filter: "blur(0px)",
          opacity: 1,
        };
    }
  };

  const getProps = (type: string) => {
    switch (mode) {
      case "drawer":
        return getForDrawer(type);
      default:
        return getForModal(type);
    }
  };

  return (
    <AnimatePresence mode="popLayout">
      {isOpen ? (
        <article
          className={cn(
            "z-[90] relative", // try to not go further than 30
            "grid place-content-center min-h-svh h-fit px-4",
            "fixed overflow-hidden",
            {
              "inset-0 overflow-y-auto": mode !== "naked",
              "place-content-end p-3": mode === "naked",
              "bottom-0 right-0": mode === "naked" || mode === "drawer",
            },
            containerClassName
          )}
        >
          <motion.article
            onClick={onClose}
            className="grid-overlay absolute inset-0 "
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.section
            onClick={(e) => e.stopPropagation()}
            exit={getProps("exit")}
            initial={getProps("initial")}
            animate={getProps("animate")}
            className={cn(
              "bg-white",
              "border-2 border-black overflow-hidden",
              " rounded-3xl h-fit  md:h-auto md:min-h-[534px] max-w-[840px] relative",
              "flex flex-col",
              className
            )}
          >
            {!noCloseButton && (
              <BrutalButtonClose
                className="absolute top-3 md:top-6 right-6 md:right-8"
                onClick={onClose}
              />
            )}
            <div className="flex gap-3 items-center border-b-black border-b-2 h-14 md:h-[88px] px-6 md:px-8">
              <img className="w-6 md:w-8" src={icon} alt="provider" />
              <h2
                className={cn("text-xl md:text-3xl font-semibold  ", {
                  "mb-1": mode === "naked",
                  "mb-4": mode === "drawer",
                })}
              >
                {title}
              </h2>
            </div>
            <div className=" flex h-full flex-col md:flex-row">
              <div
                className={cn("w-6/6 md:w-4/6 px-6 pt-6", "md:px-8 md:pt-8")}
              >
                {children}{" "}
              </div>
              <div
                className={cn(
                  "w-6/6 border-l-0 border-t-2 border-t-black  p-6 flex h-full  flex-col",
                  "md:p-8 md:border-t-0 md:w-2/6 md:border-l-black md:border-l-2"
                )}
              >
                <div className="flex mb-3">
                  <Avatar />
                  <Avatar className="-ml-3" />
                  <Avatar className="-ml-3" />
                </div>
                <p className="text-iron">¿Tienes una pregunta?</p>
                <ModalItemList
                  link="/blog"
                  icon="/icons/blog.svg"
                  label="Integración paso a paso"
                />
                <ModalItemList
                  icon="/icons/chat.svg"
                  label="Chatea con nosotros"
                />
                <div className="mt-6 md:mt-auto">
                  <div className="text-xs flex gap-1 mb-3 w-full items-start  rounded bg-status-success-overlay text-status-success p-1">
                    <FaCheck className="mt-[2px]" />
                    <span>Cuenta conectada: Fixtergeek</span>
                  </div>
                  <BrutalButton
                    className="w-full bg-black text-white "
                    containerClassName="w-full  "
                  >
                    Conectar
                  </BrutalButton>
                </div>
              </div>
            </div>
          </motion.section>
        </article>
      ) : null}
    </AnimatePresence>
  );
};

const ModalItemList = ({
  link,
  icon,
  label,
}: {
  link?: string;
  icon: string;
  label: string;
}) => {
  return (
    <Link to={link}>
      <div className="flex gap-2 items-center text-iron mt-2">
        <img src={icon} alt={label} />
        <span>{label}</span>
      </div>{" "}
    </Link>
  );
};
