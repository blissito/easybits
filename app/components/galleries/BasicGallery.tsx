import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/utils/cn";

type Item = {
  name: string;
  text: string;
  src: string;
};

export const BasicGallery = ({ items }: { items: Item[] }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const timeout = useRef<ReturnType<typeof setTimeout>>(null);

  const change = () => {
    timeout.current && clearTimeout(timeout.current);
    setCurrentIndex((i) => (i + 1) % 3);
    timeout.current = setTimeout(change, 3000);
  };

  const pause = () => timeout.current && clearTimeout(timeout.current);
  const resume = () => {
    timeout.current && clearTimeout(timeout.current);
    timeout.current = setTimeout(change, 3000);
  };

  useEffect(() => {
    change();
  }, []);

  return (
    <section
      onMouseEnter={pause}
      onMouseLeave={resume}
      className="bg-munsell min-h-[70vh] relative border-b-[1px] border-b-black px-4 md:px-[5%] xl:px-0 pb-28 pt-16 md:py-0"
    >
      <img className="absolute left-72 top-12" src="/star.png" alt="star" />
      <img
        className="absolute right-8 md:right-20 bottom-6 md:bottom-12"
        src="/circle.svg"
        alt="circle"
      />
      <div className="max-w-7xl mx-auto items-center">
        <CommentItem
          item={items[currentIndex]}
          onClick={(index) => setCurrentIndex(index)}
          currentIndex={currentIndex}
        />
      </div>
    </section>
  );
};

const CommentItem = ({
  item,
  onClick,
  currentIndex,
}: {
  currentIndex: number;
  onClick?: (arg0: number) => void;
  item: Item;
}) => {
  return (
    <AnimatePresence mode="popLayout">
      <section className="flex items-center justify-between min-h-[70vh] relative flex-wrap-reverse md:flex-nowrap ">
        <div className="w-full md:w-[50%]">
          <motion.p
            key={item.text}
            initial={{ filter: "blur(4px)", x: -10 }}
            exit={{ filter: "blur(4px)", x: 10 }}
            animate={{ filter: "blur(0px)", x: 0 }}
            className="text-xl text-center md:text-left md:text-2xl lg:text-3xl xl:text-4xl font-bold"
          >
            {item.text}
          </motion.p>
          <motion.h4
            key={item.name}
            initial={{ filter: "blur(4px)", y: 10 }}
            animate={{ filter: "blur(0px)", y: 0 }}
            className="text-base text-center md:text-left lg:text-xl font-semibold mt-8"
          >
            {item.name}
          </motion.h4>
          <section className="-bottom-10 md:bottom-20 absolute flex justify-center  w-full md:w-fit gap-2">
            <DotButton
              currentIndex={currentIndex}
              index={0}
              onClick={() => onClick?.(0)}
            />
            <DotButton
              currentIndex={currentIndex}
              index={1}
              onClick={() => onClick?.(1)}
            />
            <DotButton
              currentIndex={currentIndex}
              index={2}
              onClick={() => onClick?.(2)}
            />
          </section>
        </div>
        <motion.img
          initial={{ x: 30, opacity: 0, filter: "blur(4px)" }}
          animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ x: -30, opacity: 0, filter: "blur(4px)" }}
          key={item.src}
          className="w-[80%] mx-auto md:w-[40%] lg:w-auto mb-6 md:mb-0"
          src={item.src}
          alt="user"
        />
      </section>
    </AnimatePresence>
  );
};

const DotButton = ({
  onClick,
  currentIndex,
  index,
  ...props
}: {
  onClick?: () => void;
  [x: string]: unknown;
}) => {
  return (
    <button
      onClick={() => onClick?.(2)}
      className={cn(
        "w-6 h-6 rounded-full bg-black border-[1px] border-b-[2px] border-r-[2px] border-black relative"
      )}
      {...props}
    >
      {currentIndex === index && (
        <motion.div
          layoutId="highlighter"
          transition={{ type: "spring", stiffness: 100, damping: 12 }}
          className={cn(
            "absolute inset-0 bg-white rounded-full border border-black z-10",
            "inset-0",
            "bottom-px right-px"
          )}
        />
      )}
    </button>
  );
};
