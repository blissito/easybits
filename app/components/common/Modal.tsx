import { useEffect, type ReactNode } from "react";
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
  mode?: "overlay" | "naked";
  className?: string;
  containerClassName?: string;
  onClose?: () => void;
  isOpen?: boolean;
  children?: ReactNode;
  title?: ReactNode;
}) => {
  const keyDownHandler = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      onClose?.();
    }
  };

  useEffect(() => {
    if (isOpen && block) {
      document.body.style.overflow = "hidden";
      addEventListener("keydown", keyDownHandler);
    } else {
      document.body.style.overflow = "inherit";
      removeEventListener("keydown", keyDownHandler);
    }
    // if(mode==='naked'){
    //   document.body.style.overflow = "inherit";
    //   removeEventListener("keydown", keyDownHandler);
    // }
    return () => {
      document.body.style.overflow = "inherit";
      removeEventListener("keydown", keyDownHandler);
    };
  }, [isOpen]);

  return (
    <AnimatePresence mode="popLayout">
      {isOpen ? (
        <article
          className={cn(
            "z-20", // try to not go further than 30
            "grid place-content-center",
            "fixed",

            {
              "inset-0": mode !== "naked",
              "place-content-end p-3": mode === "naked",
              "bottom-0 right-0": mode === "naked",
            },
            containerClassName
          )}
        >
          {mode === "overlay" && (
            <motion.article
              onClick={onClose}
              className="grid-overlay absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
          <motion.section
            onClick={(e) => e.stopPropagation()}
            exit={{
              y: 10,
              filter: "blur(4px)",
              opacity: 0,
            }}
            initial={{
              y: 10,
              filter: "blur(4px)",
              opacity: 0,
            }}
            animate={{
              y: 0,
              filter: "blur(0px)",
              opacity: 1,
            }}
            className={cn(
              "bg-white",
              "border-2 border-black",
              "px-12 rounded-3xl min-h-[500px] w-[600px] relative",
              "flex flex-col",
              "max-w-[600px] lg:min-w-[600px]",
              {
                "min-h-[0px] pb-4 max-w-[300px]": mode === "naked",
              },
              className
            )}
          >
            {!noCloseButton && (
              <BrutalButtonClose
                className="absolute top-6 right-6"
                onClick={onClose}
              />
            )}
            <h2
              className={cn("text-4xl font-semibold mb-4 mt-12", {
                "my-3": mode === "naked",
              })}
            >
              {title}
            </h2>
            {children}
            {footer && (
              <section className="mt-auto mb-12 flex gap-6 justify-end">
                {footer}
              </section>
            )}
          </motion.section>
        </article>
      ) : null}
    </AnimatePresence>
  );
};
