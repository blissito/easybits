import { useEffect } from "react";

export const useScript = (url: string, cb?: (arg0: Event) => void) => {
  useEffect(() => {
    const s = document.createElement("script");
    s.async = false;
    s.defer = false;
    s.src = url;
    document.head.appendChild(s);
    s.onload = (e) => {
      cb?.(e);
    };
  }, []);
};
