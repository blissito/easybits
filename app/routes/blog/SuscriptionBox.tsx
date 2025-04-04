import { BrutalButton } from "~/components/common/BrutalButton";
import { cn } from "~/utils/cn";

export const SuscriptionBox = ({ className }: { className?: string }) => {
  return (
    <section
      className={cn(
        "max-w-3xl h-fit md:h-72 border-black border-[2px] overflow-hidden md:rounded-t-full bg-coverSuscription   rounded-r-3xl rounded-t-3xl  md:rounded-r-full  bg-cover mx-auto p-6 md:p-8  justify-center relative",
        className
      )}
    >
      <div className="w-full  text-center relative">
        <h3 className="text-2xl md:text-3xl font-bold">
          Suscríbete a nuestro newsletter
        </h3>
        <p className="text-base md:text-xl mt-2 md:mt-3">
          Recibe un resumen mensual de las mejores publicaciones y
          funcionalidades nuevas de EasyBits.
        </p>
        <div className="flex gap-4 max-w-2xl mx-auto mt-10 flex-wrap md:flex-nowrap justify-center">
          <input
            className="bg-white  rounded-xl w-full border-2 border-black "
            placeholder="ejemplo@easybist.cloud"
          />{" "}
          <BrutalButton containerClassName=" -mt-[2px] ml-[1px]">
            ¡Apuntarme!
          </BrutalButton>
        </div>
      </div>
    </section>
  );
};
