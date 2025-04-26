import type { String } from "aws-sdk/clients/cloudsearchdomain";
import { stagger, useAnimate } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "~/utils/cn";

export const FlipLetters = ({
  word,
  type,
}: {
  word: string;
  type?: string;
}) => {
  const letters = word.split("");
  const [isHovered, setIsHovered] = useState(false);
  return (
    <section
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ perspective: 1000, transformStyle: "preserve-3d" }}
      className="text-3xl font-bold relative h-20 w-[120px] font-jersey"
    >
      <DominoesBox isHovered={isHovered} letters={letters} type={type} />
      <DominoesBox
        reversed
        isHovered={isHovered}
        letters={letters}
        type={type}
      />
    </section>
  );
};

const DominoesBox = ({
  isHovered,
  letters,
  reversed,
  type,
}: {
  reversed?: boolean;
  isHovered?: boolean;
  letters: string[];
  type?: string;
}) => {
  const [scope, animate] = useAnimate();
  const transition = {
    duration: 0.3,
    bounce: 0,
    delay: stagger(0.05, { ease: "easeIn" }),
  };

  useEffect(() => {
    if (isHovered) {
      animate("span", { rotateX: reversed ? 0 : 90, y: "-40%" }, transition);
    } else {
      animate("span", { rotateX: reversed ? 90 : 0, y: 0 }, transition);
    }
  }, [isHovered]);

  useEffect(() => {
    const anim = async () => {
      await animate("span", { y: -10, rotateX: reversed ? 90 : 0 }); // hack esperar y transformar en invisible
      animate("span", { y: 0, opacity: 1 }, transition);
    };
    anim();
  }, []);

  return (
    <div
      ref={scope}
      className={cn("text-gray-100 flex absolute top-6", {
        "text-black ": type === "light",
        "text-white top-[50%]": reversed,
        "text-black top-[50%]": reversed && type === "light",
      })}
    >
      {letters.map((letter, i) => (
        <span className="opacity-0" key={i}>
          {letter}
        </span>
      ))}
    </div>
  );
};
