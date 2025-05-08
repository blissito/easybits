import { Modal } from "../common/Modal";
import { useFetcher } from "react-router";
import { BrutalButton } from "../common/BrutalButton";
import { FaArrowLeft } from "react-icons/fa";
import { useForm } from "react-hook-form";
import { useStep } from "~/hooks/useSteps";
import LookAndFeel from "./LookAndFeel";
import LinksStep from "./LinksStep";

export default function StoreConfigForm({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  // const action = "";
  // const files = [];
  const fetcher = useFetcher();

  const defaultValues = {
    colorMode: "light",
    typography: "Avenir",
    hexColor: "#DADADA",
    socialNetworks: true,
  };

  const { handleSubmit, control, register } = useForm({
    defaultValues,
  });

  const steps = [LookAndFeel, LinksStep];

  const { stepIndex, isFirst, isLast, next, previous, goTo } = useStep({
    initialStep: 1,
    steps,
  });
  const StepComponent = steps[stepIndex];

  const submit = (values) => {
    console.log({ values });
    // fetcher.submit(
    //   { intent: "store_config", data: JSON.stringify(values) },
    //   {
    //     method: "patch",
    //     action: "/api/v1/profile",
    //   }
    // );
    if (isLast) {
      goTo(0);
      onClose?.();
      return;
    }
    next();
  };

  return (
    <>
      <Modal
        mode="drawer"
        containerClassName="z-50"
        isOpen={true}
        title={"Personaliza el look de tu sitio"}
        onClose={onClose}
      >
        <fetcher.Form
          onSubmit={handleSubmit(submit)}
          className="w-full h-max flex flex-col"
        >
          <div>
            <StepComponent control={control} register={register} />
          </div>
          <div className="flex justify-between gap-2 mt-4 fixed bottom-0 w-full left-0 p-6 md:p-8">
            <BrutalButton
              mode="ghost"
              type="button"
              className="min-w-10"
              onClick={previous}
              isDisabled={isFirst}
            >
              <FaArrowLeft />
            </BrutalButton>
            <BrutalButton isLoading={fetcher.state !== "idle"} type="submit">
              Continuar
            </BrutalButton>
          </div>
        </fetcher.Form>
      </Modal>
    </>
  );
}
