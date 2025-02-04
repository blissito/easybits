import { useMotionValueEvent, useScroll } from "framer-motion";
import { useRef, useState } from "react";

export const useScrollDirection = () => {
  const prev = useRef(0);
  const [direction, setDirection] = useState(1);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (val) => {
    if (val < prev.current) {
      setDirection(-1);
    } else if (val > prev.current) {
      setDirection(1);
    }
    prev.current = val;
  });
  return direction;
};
