import {
  useAnimationControls,
  motion,
  useMotionValue,
  useMotionTemplate,
  useTransform,
  easeIn,
} from "motion/react";
import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { PiRobotDuotone } from "react-icons/pi";
import { useMarquee } from "~/hooks/useMarquee";
import { cn } from "~/utils/cn";

export function Banners({
  children,
  rotation,
  bgClass,
}: {
  children?: ReactNode;
  rotation?: number;
  bgClass?: string;
}) {
  const firstChildren = Children.toArray(children)[0];
  const [currentHover, setCurrentHover] = useState(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const X = useTransform(x, [0, 600], [300, 500], {
    ease: easeIn,
  });
  const Y = useTransform(y, [0, 600], [300, 500], {
    ease: easeIn,
  });

  const background = useMotionTemplate`radial-gradient(at ${X}px ${Y}px, #5158f6 1%, black 80%)`;

  const hadleMouseMove = (e) => {
    x.set(e.pageX);
    y.set(e.pageY);
  };

  return (
    <>
      <motion.article
        onMouseMove={hadleMouseMove}
        className="h-[15vh] relative "
      >
        <section>
          <AnimatedBanner
            bgClass={bgClass}
            onHoverStart={() => setCurrentHover(1)}
            isHovered={currentHover === 1}
            rotate={rotation}
          >
            {firstChildren}
          </AnimatedBanner>
        </section>
      </motion.article>
    </>
  );
}

const AnimatedBanner = ({
  children,
  rotate,
  reversed,
  bgClass = "bg-brand-500",
  onHoverStart,
  isHovered,
}: {
  children?: ReactNode;
  rotate?: number;
  reversed?: boolean;
  bgClass?: string;
  onHoverStart?: () => void;
  isHovered: boolean;
}) => {
  const parentControls = useAnimationControls();
  const { x, ref } = useMarquee(reversed);

  const handleHover = () => {
    onHoverStart?.();
  };

  useEffect(() => {
    // animationController(isInView);
    if (isHovered) {
      parentControls.start({ filter: "blur(0)" }, { duration: 1 });
    } else {
      parentControls.start({ filter: "blur(6px)" }, { duration: 2 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHovered]);

  return (
    <motion.div
      animate={parentControls}
      onHoverStart={handleHover}
      style={{
        transformOrigin: "center",
        transform: `rotate(${rotate}deg) translateY(-40%)`,
      }}
      className={cn(
        "h-16 md:h-20 absolute left-[-10%] top-[45%] flex w-[150vw]",
        bgClass
      )}
    >
      <motion.div
        ref={ref}
        style={{ x }}
        className=" text-black font-normal font-cabin flex items-center h-full  lg:text-4xl text-2xl md:text-3xl gap-10 whitespace-nowrap font-sans -translate-x-full"
      >
        {children}
      </motion.div>
    </motion.div>
  );
};

export const Robot = () => {
  return (
    <span
      className="animate-spin"
      style={{
        animationDuration: "5s",
      }}
    >
      <PiRobotDuotone />
    </span>
  );
};
