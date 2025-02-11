import { BrutalButton } from "~/components/common/BrutalButton";
import { BrutalElement } from "~/components/common/BrutalElement";
import { Button } from "~/components/common/Button";

export const Hero = () => {
  return (
    <section className="h-fit pt-24 pb-6 md:pb-0  md:min-h-[95vh] text-center md:text-left flex-wrap-reverse md:flex-nowrap flex justify-center items-center px-4 md:px-[5%] xl:px-0 w-full max-w-7xl mx-auto gap-6 lg:gap-28">
      <div className="w-full md:w-[50%]">
        <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-[80px] leading-tight font-bold">
          Vende tus assets digitales en línea{" "}
        </h1>
        <p className="text-iron text-xl lg:text-2xl xl:text-3xl font-extralight mb-6 md:mb-12 mt-2 md:mt-6">
          Únete a EasyBits y consigue tu primer venta.
        </p>
        <BrutalButton>Crear mi primer Asset</BrutalButton>
      </div>
      <div className="w-full md:w-[40%] relative">
        <img className="absolute" alt="star" src="/hero/star.svg" />
        <img
          className="absolute -left-[800px] w-16"
          alt="star"
          src="/hero/waves.svg"
        />
        <img
          className="absolute -left-[600px] bottom-0"
          alt="star"
          src="/hero/star.svg"
        />
        <img
          className="absolute bottom-0 -left-8 -rotate-12"
          alt="line"
          src="/hero/line.svg"
        />
        <div className="absolute -left-10 bottom-40">
          <BrutalElement className="w-32 md:w-48 ">
            <img
              className="  w-full border border-black "
              src="/hero/example2.png"
              alt="avatar"
            />{" "}
          </BrutalElement>
        </div>
        <div className="absolute right-6 md:-right-10 -top-8">
          <BrutalElement className="w-24 md:w-48  ">
            <img
              className="  w-full "
              src="/hero/example1.png"
              alt="page example"
            />{" "}
          </BrutalElement>
        </div>
        <div className="absolute -right-10 bottom-8">
          <BrutalElement className="w-32 md:w-48  ">
            <img
              className="  w-full "
              src="/hero/example3.png"
              alt="share screen"
            />{" "}
          </BrutalElement>
        </div>
        <img
          className="w-[65%] md:w-full mx-auto -mt-12"
          alt="platform features"
          src="/hero-img.png"
        />
      </div>
    </section>
  );
};
