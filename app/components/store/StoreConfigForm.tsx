import { Modal } from "../common/Modal";
import { useFetcher } from "react-router";
import { BrutalButton } from "../common/BrutalButton";
import { FaArrowLeft } from "react-icons/fa";
import { useForm } from "react-hook-form";
import { useStep } from "~/hooks/useSteps";
import LookAndFeel from "./LookAndFeel";
import LinksStep from "./LinksStep";
import { useRef } from 'react';
import { useUploader } from '~/hooks/useUploader';
import { useBrutalToast } from "~/hooks/useBrutalToast";

export default function StoreConfigForm({
  isOpen,
  onClose,
  storeConfig,
  assetId,
}: {
  isOpen?: boolean;
  onClose?: () => void;
  assetId: string;
}) {
  // const action = "";
  const coverFile = useRef<File>(null);
  const logoFile = useRef<File>(null);
  const fetcher = useFetcher();

  const defaultValues = {
    colorMode: "light",
    typography: "Avenir",
    hexColor: "#DADADA",
    socialNetworks: true,
    showProducts: true,
    instagram: "",
    facebook: "",
    tiktok: "",
    youtube: "",
    linkedin: "",
    x: "",
    website: "",
    ...storeConfig,
  };

  const { handleSubmit, control, register } = useForm({
    defaultValues,
  });

  const steps = [
    <LookAndFeel
      control={control}
      onCoverFileChange={(file) => coverFile.current = file}
      onLogoFileChange={(file) => logoFile.current = file}
    />,
    <LinksStep control={control} register={register} />
  ];

  const { stepIndex, isFirst, isLast, next, previous, goTo } = useStep({
    initialStep: 0,
    steps,
  });
  const stepComponent = steps[stepIndex];

  const { upload } = useUploader({ assetId });

  const processAndUploadImages = async (file: File) => {
    if (!file) return null;
    const uploaded = await upload(file, assetId);
    return uploaded;
  }
  const brutalToast = useBrutalToast();

  const submit = async (values) => {
    if (isLast) {
      goTo(0);
      onClose?.();
      brutalToast("El look de tu sitio se ha actualizado");
      const logoUrl = await processAndUploadImages(logoFile.current!);
      const coverUrl = await processAndUploadImages(coverFile.current!);
      
      if (logoUrl) values.logoImage = logoUrl;
      if (coverUrl) values.coverImage = coverUrl;

      fetcher.submit(
        {
          intent: "update_store_config",
          data: JSON.stringify(values),
        },
        {
          method: "post",
          action: "/api/v1/store-config",
        }
      );
      return;
    }
    next();
  };

  return (
    <>
      <Modal
        mode="drawer"
        containerClassName="z-50"
        isOpen={isOpen}
        title={"Personaliza el look de tu sitio"}
        onClose={onClose}
      >
        <fetcher.Form
          onSubmit={handleSubmit(submit)}
          className="w-full h-max flex flex-col"
        >
          <div>
            { stepComponent }
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
              { isLast ? 'Guardar' : 'Continuar' }
            </BrutalButton>
          </div>
        </fetcher.Form>
      </Modal>
    </>
  );
}
