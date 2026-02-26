import { useMotionValueEvent, useScroll } from "motion/react";
import { useRef } from "react";

export const useScrollDirection = () => {
  const prev = useRef(0);
  const direction = useRef(1);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (val) => {
    if (val < prev.current) {
      direction.current = -1;
    } else if (val > prev.current) {
      direction.current = 1;
    }
    prev.current = val;
  });
  return direction;
};
