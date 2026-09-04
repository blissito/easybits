import { motion, useSpring } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { twMerge } from "tailwind-merge";
import { BrutalButton } from "~/components/common/BrutalButton";
import { BrutalElement } from "~/components/common/BrutalElement";
import { TextBlurEffect } from "~/components/TextBlurEffect";

export const Hero = () => {
  return (
    <section className=" h-fit pt-10 md:pt-6 pb-6 md:pb-0  md:min-h-[88vh] text-center md:text-left flex-wrap-reverse md:flex-nowrap flex justify-between items-center px-4 md:px-[5%] xl:px-0 w-full max-w-7xl mx-auto gap-0 lg:gap-10">
      <div className="w-full md:w-[50%] ">
        <TextBlurEffect>
          <h1 className="text-4xl  md:text-5xl lg:text-6xl xl:text-[72px] leading-tight font-bold">
            La nube para{" "}
            <span className="underline decoration-4 decoration-brand-500 underline-offset-4">
              expertos IA
            </span>
          </h1>

          <p className="text-iron text-xl lg:text-2xl xl:text-2xl font-extralight mb-6 md:mb-10 mt-2 md:mt-6">
            Sandboxes, web, archivos, datos y WhatsApp para tus agentes — desde
            un solo MCP, en MXN.
          </p>
        </TextBlurEffect>
        <div className="flex flex-wrap items-center gap-4 justify-center md:justify-start">
          <Link to="/login">
            <BrutalButton id="EmpezarGratisHome">Empezar gratis →</BrutalButton>
          </Link>
          <Link
            to="/calculadora"
            id="CotizarMiAgenteHome"
            className="text-lg font-medium underline decoration-2 underline-offset-4 hover:decoration-brand-500"
          >
            Calcula tu costo
          </Link>
        </div>
        {/* Prueba social: números verificables (server.ts, catálogo web, resume de microVM). */}
        <p className="text-iron text-sm md:text-base mt-6 md:mt-8 font-mono">
          +200 tools MCP · 1,000+ fuentes web · microVMs en &lt;1 s · precios en MXN
        </p>
      </div>
      <div className="w-full md:w-[40%] relative min-h-[285px] ">
        <FloatingMotif
          className="absolute -top-16 left-1/2 -translate-x-1/2 w-12 hidden md:block"
          alt="star"
          src="/home/star.svg"
          range={10}
          duration={3.2}
        />
        <FloatingMotif
          className="absolute -top-12 -left-[800px] w-16"
          alt="waves"
          src="/home/waves.svg"
          range={12}
          duration={3.6}
          delay={0.4}
        />
        <FloatingMotif
          className="absolute -left-[600px] -bottom-20"
          alt="star"
          src="/home/star.svg"
          range={10}
          duration={4}
          delay={0.8}
        />
        <FloatingMotif
          className="absolute bottom-0 -left-8 -rotate-12"
          alt="line"
          src="/home/line.svg"
          range={8}
          duration={3.4}
          delay={0.6}
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

const FloatingMotif = ({
  className,
  src,
  alt,
  range = 10,
  duration = 3.2,
  delay = 0,
}: {
  className?: string;
  src: string;
  alt: string;
  range?: number;
  duration?: number;
  delay?: number;
}) => {
  return (
    <motion.img
      className={className}
      src={src}
      alt={alt}
      animate={{ y: [-range, range, -range] }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
};
