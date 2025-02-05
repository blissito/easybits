import type { Asset } from "@prisma/client";
import { useFetcher } from "react-router";
import { useForm, type FieldValues, type SubmitHandler } from "react-hook-form";
import { BrutalButton } from "../common/BrutalButton";
import { Input } from "./Input";
import { RadioGroup } from "./RadioInput";
import { useEffect, type ChangeEvent } from "react";

export const AssetForm = ({
  onClose,
  asset = { title: "", type: "" },
}: {
  asset?: Asset;
  onClose?: (values: Asset) => void;
}) => {
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";

  const submit = async (values: SubmitHandler<FieldValues>) => {
    console.log("VALUES::", values);
    // await fetcher.submit(
    //   { intent: "new_asset", data: JSON.stringify(values) },
    //   {
    //     method: "post",
    //     action: "api/assets",
    //   }
    // );
    onClose?.(values);
  };

  const {
    handleSubmit,
    register,
    formState: { isValid, errors },
    setValue,
  } = useForm({
    defaultValues: {
      title: asset.title,
      type: asset.type,
    },
  });
  const registerVirtualFields = () => {
    register("title", { value: "", required: true });
    register("type", { value: "", required: true });
  };

  useEffect(() => {
    registerVirtualFields();
  }, []);

  const handleChange = (name: "title" | "type", value: string) => {
    console.log("Change", name, value);
    setValue(name, value, { shouldValidate: true, shouldDirty: true });
  };

  return (
    <fetcher.Form
      onSubmit={handleSubmit(submit)}
      className="flex flex-col h-max pb-12"
    >
      <Input
        pattern=".{3,}"
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          handleChange("title", e.currentTarget.value)
        }
        label="Ponle nombre a tu asset"
        placeholder="Curso de cocina"
      />
      <h3 className="mb-4 font-medium">¿Qué tipo de asset es?</h3>

      <RadioGroup onChange={(value: string) => handleChange("type", value)} />

      <nav className="flex justify-end mt-12 gap-8">
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
