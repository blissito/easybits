import { useState, type ReactNode } from "react";
import { BsThreeDotsVertical } from "react-icons/bs";
import { useClickOutside } from "~/hooks/useOutsideClick";
import { cn } from "~/utils/cn";

export const DotsMenu = ({ children }: { children?: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useClickOutside({
    isActive: isOpen,
    onOutsideClick: () => setIsOpen(false),
    includeEscape: true,
  });
  return (
    <section className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen((o) => !o)}
        className={cn("text-lg active:scale-95 rounded-full border-black p-1", {
          border: isOpen,
        })}
      >
        <BsThreeDotsVertical />
      </button>
      {isOpen && (
        <nav
          className={cn(
            "bg-white",
            "absolute right-[50%] top-[120%] z-10 border-2 border-black rounded-lg"
          )}
        >
          {children}
        </nav>
      )}
    </section>
  );
};
