import { useForm } from "react-hook-form";
import { RadioCardGroup } from "./RadioCardGroup";
import { BrutalButton } from "~/components/common/BrutalButton";

export const StepTwo = ({ profile = { title: "", type: "" } }) => {
  const {
    handleSubmit,
    register,
    formState: { isValid },
    setValue,
  } = useForm({
    defaultValues: profile,
  });
  const registerVirtualFields = () => {
    register("title", { value: "", required: true });
    register("type", { value: "", required: true });
  };
  const handleChange = (name: "title" | "type", value: string) => {
    setValue(name, value, { shouldValidate: true, shouldDirty: true });
  };

  return (
    <>
      <div className="w-full h-full flex flex-col md:w-[50%] pt-40 px-4 md:px-20 pb-4 md:pb-12 ">
        <div className="h-full">
          <h2 className="text-3xl font-bold">
            ¿Qué opción describe mejor tu objetivo al usar EasyBits?
          </h2>
          <p className="text-lg text-iron mt-4 mb-16">
            Esto nos ayuda a personalizar tu experiencia
          </p>
          <RadioCardGroup
            onChange={(value: string) => handleChange("type", value)}
          />
        </div>
        <BrutalButton className="mt-auto w-full">Continue</BrutalButton>
      </div>
      <div className="w-full hidden md:block h-full md:w-[50%] ">
        <img
          className="h-full w-full object-cover"
          src="/hero/onboarding-1.png"
        />
      </div>
    </>
  );
};
