import { useEffect, type ReactNode } from "react";
import { FaX } from "react-icons/fa6";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "~/utils/cn";

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
                "fixed min-w-[320px] inset-0 grid place-content-center"
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
                  "border-2 border-black",
                  "bg-white px-4 rounded-3xl min-h-[500px] w-[600px] relative",
                  className
                )}
              >
                <nav className="flex">
                  <h2 className="text-4xl font-semibold my-10 ml-auto mr-auto">
                    {title}
                  </h2>
                  <button
                    onClick={onClose}
                    className="mr-8 hover:scale-110 transition-all text-2xl"
                  >
                    <FaX />
                  </button>
                </nav>
                {children}
              </motion.section>
            </article>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
};
