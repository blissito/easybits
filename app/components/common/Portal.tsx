import { createPortal } from "react-dom";
import type { ReactNode } from "react";

export const Portal = ({ children }: { children: ReactNode }) =>
  typeof document !== "undefined"
    ? createPortal(children, document.body)
    : null;
