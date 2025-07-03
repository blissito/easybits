import { useEffect, useRef, useState, type ReactNode } from "react";
import { BsThreeDotsVertical } from "react-icons/bs";
import { useClickOutside } from "~/hooks/useOutsideClick";
import { cn } from "~/utils/cn";

export const DotsMenu = ({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const ref = useClickOutside({
    isActive: isOpen,
    onOutsideClick: () => setIsOpen(false),
    includeEscape: true,
  });

  const [{ top, left }, setPosition] = useState({ top: 0, left: 0 });
  useEffect(() => {
    const { x, y, height, width } =
      buttonRef.current?.getBoundingClientRect() as DOMRect;
    setPosition({ top: y + height * 1.3, left: x - width });
  }, []);

  return (
    <section className={cn("relative", className)} ref={ref}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen((o) => !o)}
        className={cn(
          "text-lg active:scale-95 rounded-full border-black p-1",

          {
            border: isOpen,
          }
        )}
      >
        <BsThreeDotsVertical />
      </button>
      {isOpen && (
        <nav
          style={{
            top,
            left,
          }}
          onClick={() => setIsOpen(false)}
          className={cn(
            "fixed",
            "bg-white",
            "border-2 border-black rounded-lg",
            "top-0"
          )}
        >
          {children}
        </nav>
      )}
    </section>
  );
};
