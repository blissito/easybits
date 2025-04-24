import { BrutalButton } from "~/components/common/BrutalButton";
import { Input } from "~/components/common/Input";

export const StepOne = () => {
  return (
    <>
      <div className="w-full h-full flex flex-col md:w-[50%] pt-40 px-4 md:px-20 pb-4 md:pb-12 ">
        <div className="h-full">
          <h2 className="text-3xl font-bold">
            Personaliza el nombre de tu website y subdominio EasyBits
          </h2>
          <p className="text-lg text-iron mt-4 mb-16">
            Escribe tu nombre o el nombre de tu marca que hará destacar tu
            tienda
          </p>
          <Input />
        </div>
        <BrutalButton className="mt-auto w-full">Continue</BrutalButton>
      </div>
      <div className="w-full hidden md:block h-full md:w-[50%] border-l-2 border-black ">
        <img
          className="h-full w-full object-cover"
          src="/hero/onboarding-1.png"
        />
      </div>
    </>
  );
};
