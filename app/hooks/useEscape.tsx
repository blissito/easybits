import { useEffect } from "react";

export const useEscape = (cb?: () => void) => {
  const handler = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      cb?.();
    }
  };

  useEffect(() => {
    addEventListener("keydown", handler);
    return () => {
      removeEventListener("keydown", handler);
    };
  }, []);
};
