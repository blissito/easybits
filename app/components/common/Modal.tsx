import { useEffect, type ReactNode } from "react";
import { IoCloseCircleOutline } from "react-icons/io5";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "~/utils/cn";
import { IoIosClose } from "react-icons/io";
import { BrutalButton } from "./BrutalButton";
import { BrutalButtonClose } from "./BrutalButtonClose";

export const Modal = ({
  children,
  isOpen,
  title,
  onClose,
  className,
}: {
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

  return (
    <>
      <AnimatePresence mode="popLayout">
        {isOpen ? (
          <>
            <article
              onClick={onClose}
              className={cn(
                "z-20",
                "min-w-[320px] inset-0 grid place-content-center",
                "fixed"
              )}
            >
              <motion.article
                className="grid-overlay absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
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
                  className
                )}
              >
                <BrutalButtonClose
                  className="absolute top-6 right-6"
                  onClick={onClose}
                />

                <h2 className="text-4xl font-semibold my-10 ml-auto mr-auto text-center">
                  {title}
                </h2>
                {children}
              </motion.section>
            </article>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
};
