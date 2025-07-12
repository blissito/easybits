import { motion, useSpring } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { twMerge } from "tailwind-merge";
import { BrutalButton } from "~/components/common/BrutalButton";
import { BrutalElement } from "~/components/common/BrutalElement";
import { TextBlurEffect } from "~/components/TextBlurEffect";

export const Hero = () => {
  return (
    <section className=" h-fit pt-24 pb-6 md:pb-0  md:min-h-[95vh] text-center md:text-left flex-wrap-reverse md:flex-nowrap flex justify-between items-center px-4 md:px-[5%] xl:px-0 w-full max-w-7xl mx-auto gap-0 lg:gap-10">
      <div className="w-full md:w-[50%] ">
        <TextBlurEffect>
          <h1 className="text-4xl  md:text-5xl lg:text-6xl xl:text-[72px] leading-tight font-bold">
            ¡Saca los chispos digitales en línea! 🫘 🧐 🤖 👨🏻‍💻 🤔 🤡 🦫
          </h1>

          <p className="text-iron text-xl lg:text-2xl xl:text-2xl font-extralight mb-6 md:mb-12 mt-2 md:mt-6">
            Convierte esas ilustraciones, ese libro o esas conferencias en
            assets digitales y consigue tu primera venta
          </p>
        </TextBlurEffect>
        <Link to="/login">
          {" "}
          <BrutalButton id="EmpezarGratisHome">
            Crear mi primer Asset
          </BrutalButton>
        </Link>
      </div>
      <div className="w-full md:w-[40%] relative min-h-[285px] ">
        <img className="absolute" alt="star" src="/home/star.svg" />
        <img
          className="absolute -left-[800px] w-16"
          alt="star"
          src="/home/waves.svg"
        />
        <img
          className="absolute -left-[600px] bottom-0"
          alt="star"
          src="/home/star.svg"
        />
        <img
          className="absolute bottom-0 -left-8 -rotate-12"
          alt="line"
          src="/home/line.svg"
        />

        <div className="absolute -left-10 bottom-40">
          <FloatingItem delay={0.1}>
            <BrutalElement className="w-32 lg:w-48 ">
              <img
                className="  w-full  "
                src="/home/example2.webp"
                alt="avatar"
              />{" "}
            </BrutalElement>{" "}
          </FloatingItem>
        </div>

        <div className="absolute right-6 md:-right-10 -top-8">
          <FloatingItem delay={0.2}>
            <BrutalElement className="w-24  lg:w-48  ">
              <img
                className="  w-full "
                src="/home/example1.webp"
                alt="page example"
              />{" "}
            </BrutalElement>
          </FloatingItem>
        </div>
        <div className="absolute -right-10 bottom-8">
          <FloatingItem delay={0.3}>
            <BrutalElement className="w-32 md:w-48  ">
              <img
                className="  w-full "
                src="/home/example3.webp"
                alt="share screen"
              />{" "}
            </BrutalElement>
          </FloatingItem>
        </div>
        <img
          className="w-[65%] md:w-full mx-auto -mt-12 "
          alt="platform features"
          src="/home/hero-img.webp"
        />
      </div>
    </section>
  );
};

const FloatingItem = ({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) => {
  const scale = useSpring(0.5);
  return (
    <motion.div
      custom={2}
      style={{
        scale,
      }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, type: "spring", delay }}
      className={twMerge(" cursor-pointer ", className)}
    >
      {children}
    </motion.div>
  );
};
