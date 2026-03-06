import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BsThreeDotsVertical } from "react-icons/bs";
import { cn } from "~/utils/cn";
import { Portal } from "~/components/common/Portal";

export const DotsMenu = ({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 160;
    let left = rect.x - menuWidth + rect.width;
    if (left < 8) left = 8;
    let top = rect.bottom + 4;
    if (top + 200 > window.innerHeight) {
      top = rect.top - 200;
      if (top < 8) top = 8;
    }
    setPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (navRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    const handleScrollOrResize = () => setIsOpen(false);

    addEventListener("click", handleClick);
    addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      removeEventListener("click", handleClick);
      removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  return (
    <section className={cn("relative", className)}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={cn(
          "text-lg active:scale-95 rounded-full border-black p-1",
          { border: isOpen }
        )}
      >
        <BsThreeDotsVertical />
      </button>
      {isOpen && (
        <Portal>
          <nav
            ref={navRef}
            role="menu"
            style={{ top: position.top, left: position.left }}
            onClick={() => setIsOpen(false)}
            className={cn(
              "fixed z-50",
              "bg-white",
              "border-2 border-black rounded-lg",
              "shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
              "min-w-[140px]"
            )}
          >
            {children}
          </nav>
        </Portal>
      )}
    </section>
  );
};
