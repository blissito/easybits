import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const usePortal = (jsx: ReactNode) => {
  const [ref, setRef] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!document || ref) return;

    setRef(document.body);
    console.log("??", ref, jsx);
  }, [jsx]);

  return ref ? createPortal(<>{jsx}</>, ref) : "PERRO";
};
