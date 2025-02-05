import { useMotionValue, motion, useMotionTemplate } from "motion/react";
import { useEffect } from "react";

/**
 * Estos backgrounds son fixed e inset-0 con z-0
 * se emplean dentro de un padre relativo que debería cubrir:
 * 100% del ancho y 100% del alto dentro de una página.
 */
export const GridBackground = () => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const background = useMotionTemplate`radial-gradient(circle at ${x}% ${y}%, transparent, rgba(255,255,255,0.9) 33%)`;

  const handleMouseMove = (event: MouseEvent) => {
    const { pageX, pageY } = event;
    x.set(Math.round((pageX / window.innerWidth) * 100));
    y.set(Math.round((pageY / window.innerHeight) * 100));
  };

  useEffect(() => {
    addEventListener("mousemove", handleMouseMove);
    return () => removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <>
      <img
        src="/dash/grid.svg"
        alt="grid"
        className="absolute inset-0 object-cover min-h-screen pointer-events-none"
      />
      <motion.section
        className="absolute inset-0 bg-white z-0"
        style={{
          background,
        }}
      ></motion.section>
    </>
  );
};
