import type { Asset } from "@prisma/client";
import { useFetcher } from "react-router";
import { useForm, type FieldValues, type SubmitHandler } from "react-hook-form";
import { BrutalButton } from "../common/BrutalButton";
import { Input } from "./Input";
import { RadioGroup } from "./RadioInput";
import { useEffect, type ChangeEvent } from "react";
import { type NewAssetSchema } from "~/utils/zod.schemas";
import { Avatar } from "../common/Avatar";

export const ClientForm = ({
  onClose,
  asset = { title: "" },
}: {
  asset?: NewAssetSchema;
  onClose?: () => void;
}) => {
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";

  const submit = (values: SubmitHandler<FieldValues>) => {
    fetcher.submit(
      { intent: "new_asset", data: JSON.stringify(values) },
      {
        method: "post",
        action: "/api/v1/assets",
      }
    );
    onClose?.();
  };

  const {
    handleSubmit,
    register,
    formState: { isValid },
    setValue,
  } = useForm({
    defaultValues: asset,
  });
  const registerVirtualFields = () => {
    register("title", { value: "", required: true });
    register("type", { value: "", required: true });
  };

  useEffect(() => {
    registerVirtualFields();
  }, []);

  const handleChange = (name: "title" | "type", value: string) => {
    setValue(name, value, { shouldValidate: true, shouldDirty: true });
  };

  return (
    <article>
      <Avatar size="xl" className="mb-4" />

      <nav className="flex justify-end mt-12 gap-6 md:gap-8 fixed bottom-8 right-8">
        <BrutalButton className="bg-white" onClick={onClose} type="button">
          Cancelar
        </BrutalButton>
        <BrutalButton
          mode="danger"
          isDisabled={!isValid}
          isLoading={isLoading}
          type="submit"
        >
          Bloquear
        </BrutalButton>
      </nav>
    </article>
  );
};
