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
import type { StoreConfig } from '@prisma/client';

export type FileImageRef = File | 'remove' | null;
export type FileImageName = 'logoImage' | 'coverImage';

export default function StoreConfigForm({
  isOpen,
  onClose,
  storeConfig,
  assetId,
}: {
  isOpen?: boolean;
  onClose?: () => void;
  assetId: string;
  storeConfig: Partial<StoreConfig>
}) {
  // const action = "";
  const imageFiles = useRef<{ logoImage: FileImageRef, coverImage: FileImageRef }>({
    logoImage: null,
    coverImage: null
  });

  const fetcher = useFetcher();

  const defaultValues: Partial<StoreConfig> = {
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

  const { handleSubmit, control, register, setValue } = useForm({
    defaultValues,
  });

  const handleFileChange = (files: File[], name?: string) => imageFiles.current[name as FileImageName] = files?.[0] || null;
  const handleFileDelete = (name?: string) => imageFiles.current[name as FileImageName] = 'remove';

  const steps = [
    <LookAndFeel
      control={control}
      onImageFileChange={handleFileChange}
      onDeleteImage={handleFileDelete}
      storeConfig={storeConfig}
    />,
    <LinksStep control={control} register={register} />
  ];

  const { stepIndex, isFirst, isLast, next, previous, goTo } = useStep({
    initialStep: 0,
    steps,
  });
  const stepComponent = steps[stepIndex];

  const { upload } = useUploader({ assetId });
  const processAndUploadImages = async (file: File | 'remove', ref: FileImageName) => {
    if (!file || file === 'remove') {
      if (file === 'remove') imageFiles.current[ref] = null;
      setValue(ref, '');
      return '';
    }
    const uploaded = await upload(file, assetId);
    setValue(ref, uploaded as string);
    return uploaded as string;
  }

  const brutalToast = useBrutalToast();

  const submit = async (values: Partial<StoreConfig>) => {
    if (isLast) {
      goTo(0);
      onClose?.();
      brutalToast("El look de tu sitio se ha actualizado");

      if (imageFiles.current.logoImage) {
        values.logoImage = await processAndUploadImages(imageFiles.current.logoImage, 'logoImage');
      }

      if (imageFiles.current.coverImage) {
        values.coverImage = await processAndUploadImages(imageFiles.current.coverImage, 'coverImage');
      }

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
          className="w-full h-full flex flex-col"
        >
          <div className="min-h-fit ">
            { stepComponent }
          </div>
          {/* <div className={`flex gap-2 mt-6 md:mt-4 block md:fixed  md:bottom-0 w-full left-0 px-0 md:p-8 ${stepIndex === 1 ? 'justify-between' : 'justify-end'}`}> */}
        <div className={`flex gap-2 mt-auto pt-6  ${stepIndex === 1 ? 'justify-between' : 'justify-end'}`}>
            {stepIndex === 1 && (
              <BrutalButton
                mode="ghost"
                type="button"
                className="min-w-10"
                onClick={previous}
                isDisabled={isFirst}
              >
                <FaArrowLeft />
              </BrutalButton>
            )}
            <BrutalButton isLoading={fetcher.state !== "idle"} type="submit">
              { isLast ? 'Guardar' : 'Continuar' }
            </BrutalButton>
          </div>
        </fetcher.Form>
      </Modal>
    </>
  );
}
