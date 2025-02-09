import { useEffect, useRef } from "react";

export const useClickOutside = <T extends HTMLDivElement>({
  isActive,
  onOutsideClick,
  includeEscape,
}: {
  includeEscape?: boolean;
  isActive: boolean;
  onOutsideClick?: (e: MouseEvent | KeyboardEvent) => void;
}) => {
  const ref = useRef<T>(null);

  const handleClick = (e: MouseEvent) =>
    !ref.current?.contains(e.target as Node) && onOutsideClick?.(e);

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onOutsideClick?.(e);
    }
  };

  useEffect(() => {
    if (!isActive) return;
    document.addEventListener("click", handleClick);
    if (includeEscape) {
      addEventListener("keydown", handleKey);
    }
    return () => {
      document.removeEventListener("click", handleClick);
      removeEventListener("keydown", handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  return ref;
};
