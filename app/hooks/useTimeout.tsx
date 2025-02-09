import { useEffect, useRef } from "react";

export const useTimeout = (milisecs: number = 1000) => {
  const timeout = useRef<ReturnType<typeof setTimeout>>(null);
  useEffect(() => {
    timeout.current && clearTimeout(timeout.current);
  }, []);
  const placeTimeout = (cb: () => void) => {
    timeout.current = setTimeout(cb, milisecs);
  };
  const cancelTimeout = () => {
    timeout.current && clearTimeout(timeout.current);
  };
  return {
    timeout,
    placeTimeout,
    cancelTimeout,
  };
};
