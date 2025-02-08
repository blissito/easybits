import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "~/utils/cn";
import { BrutalButtonClose } from "./BrutalButtonClose";

export const Modal = ({
  noCloseButton,
  children,
  mode,
  isOpen,
  title,
  onClose,
  className,
}: {
  noCloseButton?: boolean;
  mode: "overlay" | "naked";
  className?: string;
  onClose?: () => void;
  isOpen?: boolean;
  children?: ReactNode;
  title?: string;
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

  useEffect(() => {
    if (isOpen && mode === "naked") {
      document.body.style.overflow = "inherit";
    }
  }, [mode]);

  return (
    <>
      <AnimatePresence mode="popLayout">
        {isOpen ? (
          <>
            <article
              onClick={onClose}
              className={cn(
                "z-20",
                "inset-0 grid place-content-center",
                "fixed",
                { "place-content-end p-3": mode === "naked" }
              )}
            >
              {mode === "overlay" && (
                <motion.article
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
                  "px-4 rounded-3xl min-h-[500px] w-[600px] relative flex flex-col",
                  "max-w-[600px]",
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
                  className={cn(
                    "text-4xl font-semibold my-10 ml-auto mr-auto",
                    {
                      "my-3": mode === "naked",
                    }
                  )}
                >
                  {title}
                </h2>
                {children}
                {mode === "naked" && (
                  <p className="text-xs text-brand-gray pt-3">Subiendo...</p>
                )}
              </motion.section>
            </article>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
};
