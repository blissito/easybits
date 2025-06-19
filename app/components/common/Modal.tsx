import { useEffect, useCallback, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "~/utils/cn";
import { BrutalButtonClose } from "./BrutalButtonClose";

export const Modal = ({
  noCloseButton,
  children,
  mode = "overlay",
  isOpen,
  title,
  onClose,
  className,
  containerClassName,
  footer,
  block = true,
}: {
  block?: boolean;
  footer?: ReactNode;
  noCloseButton?: boolean;
  mode?: "overlay" | "naked" | "drawer";
  className?: string;
  containerClassName?: string;
  onClose?: () => void;
  isOpen?: boolean;
  children?: ReactNode;
  title?: ReactNode;
}) => {
  const keyDownHandler = useCallback((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      onClose?.();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen && block) {
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", keyDownHandler);
    } else {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", keyDownHandler);
    }
    
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", keyDownHandler);
    };
  }, [isOpen, block, keyDownHandler]);

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
    <AnimatePresence mode="wait" onExitComplete={() => {
      document.body.style.overflow = "";
    }}>
      {isOpen ? (
        <article
          className={cn(
            "z-[90] relative", // try to not go further than 30
            "grid place-content-center px-4 md:px-[5%] xl:px-0",
            "fixed overflow-hidden",

            {
              "inset-0 overflow-y-auto": mode !== "naked",
              "place-content-end p-3": mode === "naked",
              "bottom-0 right-0": mode === "naked" || mode === "drawer",
            },
            containerClassName
          )}
        >
          {mode === "overlay" ? (
            <motion.article
              onClick={onClose}
              className="grid-overlay absolute inset-0 "
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
          ) : mode === "drawer" ? (
            <motion.article
              onClick={onClose}
              className="absolute inset-0 bg-black bg-opacity-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
          ) : null}
          <motion.section
            onClick={(e) => e.stopPropagation()}
            exit={getProps("exit")}
            initial={getProps("initial")}
            animate={getProps("animate")}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className={cn(
              "bg-white",
              "border-2 border-black",
              "p-6 md:p-8 rounded-3xl min-h-[472px] min-w-[360px] relative",
              "flex flex-col",
              "max-w-[600px]  mx-auto  md:w-[600px] lg:min-w-[600px]",
              {
                "min-h-[0px] max-w-[300px]": mode === "naked",
                "h-screen w-[80vw] lg:w-[40vw] rounded-none right-0 absolute border-l-2 border-y-0 border-r-0":
                  mode === "drawer",
              },
              className
            )}
          >
            {!noCloseButton && (
              <BrutalButtonClose
                className="absolute top-6 md:top-8 right-6 md:right-8"
                onClick={onClose}
              />
            )}
            <h2
              className={cn("text-2xl md:text-3xl font-semibold  ", {
                "mb-1": mode === "naked",
                "mb-4": mode === "drawer",
              })}
            >
              {title}
            </h2>
            {children}
            {footer && (
              <section className="mt-auto flex gap-6 justify-end pt-3">
                {footer}
              </section>
            )}
          </motion.section>
        </article>
      ) : null}
    </AnimatePresence>
  );
};
