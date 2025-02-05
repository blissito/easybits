import { useEffect, type ReactNode } from "react";
import { FaX } from "react-icons/fa6";

export const Modal = ({
  children,
  isOpen,
  title,
  onClose,
}: {
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

  return isOpen ? (
    <>
      <aside className="fixed inset-0 bg-black/40 backdrop-blur z-20" />
      <article className="fixed min-w-[320px] inset-0 z-20 grid place-content-center">
        <section className="bg-white px-4 rounded-3xl min-h-[500px] w-[600px] relative">
          <nav className="flex">
            <h2 className="text-4xl font-semibold my-10 ml-auto mr-auto">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="mr-8 hover:scale-110 transition-all"
            >
              <FaX />
            </button>
          </nav>
          {children}
        </section>
      </article>
    </>
  ) : null;
};
