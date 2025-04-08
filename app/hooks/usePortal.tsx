import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const usePortal = (jsx: ReactNode) => {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!document || ref.current) return;

    ref.current = document.body;
  }, [jsx]);

  return ref.current ? createPortal(<>{jsx}</>, ref.current) : null;
};
