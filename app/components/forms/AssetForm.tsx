import type { Asset } from "@prisma/client";
import { useFetcher } from "react-router";
import { useForm, type FieldValues, type SubmitHandler } from "react-hook-form";
import { BrutalButton } from "../common/BrutalButton";
import { Input } from "./Input";
import { RadioGroup } from "./RadioInput";
import { useEffect, type ChangeEvent } from "react";
import { type NewAssetSchema } from "~/utils/zod.schemas";

export const AssetForm = ({
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

  const getRandomString = (elements: string[]): string =>
    elements[Math.floor(Math.random() * elements.length)];

  return (
    <fetcher.Form
      onSubmit={handleSubmit(submit) as unknown as React.FormEventHandler<HTMLFormElement>}
      className="flex flex-col h-max "
    >
      <br />
      <Input
        pattern=".{3,}"
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          handleChange("title", e.currentTarget.value)
        }
        label="Ponle nombre a tu asset"
        placeholder={`Curso de ${getRandomString([
          "macramé",
          "programación",
          "auto-administración",
          "coctelería",
          "cocina",
          "autodefensa",
          "literatura",
          "autodidactismo",
        ])}`}
      />

      <h3 className="mb-4 font-medium">¿Qué tipo de asset es?</h3>

      <RadioGroup onChange={(value: string) => handleChange("type", value)} />

      <nav className="flex justify-end mt-12 gap-6">
        <BrutalButton className="bg-white" onClick={onClose} type="button">
          Cancelar
        </BrutalButton>
        <BrutalButton isDisabled={!isValid} isLoading={isLoading} type="submit">
          Continuar
        </BrutalButton>
      </nav>
    </fetcher.Form>
  );
};
