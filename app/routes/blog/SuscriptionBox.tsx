import { BrutalButton } from "~/components/common/BrutalButton";

export const SuscriptionBox = () => {
  return (
    <section className="max-w-3xl h-fit md:h-64 border-black border rounded-xl bg-coverSuscription bg-cover mx-auto p-4 md:p-8 flex relative">
      <div className="w-full md:w-[80%]">
        <h3 className="text-2xl md:text-3xl font-bold">
          Suscríbete a nuestro newsletter
        </h3>
        <p className="text-base md:text-xl mt-2 md:mt-3">
          Recibe un resumen mensual de las mejores publicaciones y
          funcionalidades nuevas de EasyBits.
        </p>
        <div className="bg-white flex justify-between rounded-2xl h-12 border-black border-[2px] mt-4 md:mt-8 w-full md:w-96 ">
          <input
            className="bg-transparent border-none rounded-xl w-full  "
            placeholder="ejemplo@easybist.cloud"
          />{" "}
          <BrutalButton containerClassName=" -mt-[2px] ml-[1px]">
            ¡Apuntarme!
          </BrutalButton>
        </div>
      </div>
      <img
        className="absolute w-24 md:w-auto right-0 md:right-10 -top-16 md:top-[40px] "
        src="/hero/buzon.svg"
      />
    </section>
  );
};
