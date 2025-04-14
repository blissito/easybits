import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/utils/cn";

type Item = {
  name?: string;
  text?: string;
  src: string;
};

export const ProductGallery = ({
  items = [],
  className,
}: {
  className?: string;
  items: Item[];
}) => {
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
      className={cn(
        "overflow-hidden h-[280px] md:h-[600px] relative ",
        className
      )}
    >
      <div className="w-full h-full">
        {items.length == 0 ? (
          <img
            className="object-contain h-full w-full"
            src="/images/easybits-default.webp"
          />
        ) : items.length == 1 ? (
          <img className="object-cover h-full w-full" src={items[0].src} />
        ) : items.length >= 3 ? (
          <ImageItem
            images={items}
            item={items[currentIndex]}
            onClick={(index) => setCurrentIndex(index)}
            currentIndex={currentIndex}
          />
        ) : null}
      </div>
    </section>
  );
};

const ImageItem = ({
  item = {} as Item,
  onClick,
  currentIndex,
  images,
}: {
  currentIndex: number;
  onClick?: (arg0: number) => void;
  item: Item;
  images: string[];
}) => {
  return (
    <AnimatePresence mode="popLayout">
      <section className="flex items-center justify-between h-[280px] md:h-[600px] w-full relative ">
        <section className=" absolute flex w-full z-30 justify-center bottom-4 md:bottom-10 gap-2">
          {images.map((image, i) => (
            <DotButton
              index={i}
              currentIndex={currentIndex}
              key={i}
              onClick={() => onClick?.(i)}
            />
          ))}
          {/* <DotButton
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
          {lenght === 4 ? (
            <DotButton
              currentIndex={currentIndex}
              index={2}
              onClick={() => onClick?.(3)}
            />
          ) : null}
          {lenght === 5 ? (
            <DotButton
              currentIndex={currentIndex}
              index={2}
              onClick={() => onClick?.(5)}
            />
          ) : null} */}
        </section>

        <motion.img
          initial={{ x: 30, opacity: 0, filter: "blur(4px)" }}
          animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ x: -30, opacity: 0, filter: "blur(4px)" }}
          key={item.src}
          className="w-full h-full object-cover object-center"
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
