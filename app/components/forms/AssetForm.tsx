import type { Asset } from "@prisma/client";
import { useFetcher } from "react-router";
import { useForm, type FieldValues, type SubmitHandler } from "react-hook-form";
import { BrutalButton } from "../common/BrutalButton";
import { Input } from "./Input";
import { RadioGroup, RadioInput } from "./RadioInput";

export const AssetForm = ({
  onClose,
  asset = { title: "", type: "" },
}: {
  asset?: Asset;
  onClose?: (values: Asset) => void;
}) => {
  const fetcher = useFetcher();
  const { handleSubmit } = useForm({
    defaultValues: {
      name: asset.name,
      type: asset.type,
    },
  });
  const submit = async (values: SubmitHandler<FieldValues>) => {
    console.log("VALUES::", values);
    await fetcher.submit(
      { intent: "new_asset", data: JSON.stringify(values) },
      {
        method: "post",
        action: "api/assets",
      }
    );
    onClose?.(values);
  };

  const isLoading = fetcher.state !== "idle";

  return (
    <fetcher.Form
      onSubmit={handleSubmit(submit)}
      className="flex flex-col h-max pb-12"
    >
      <Input label="Ponle nombre a tu asset" placeholder="Curso de cocina" />
      <h3 className="mb-4 font-medium">¿Qué tipo de asset es?</h3>
      <RadioGroup />
      <nav className="flex justify-end mt-12 gap-8">
        <BrutalButton className="bg-white" onClick={onClose} type="button">
          Cancelar
        </BrutalButton>
        <BrutalButton isLoading={isLoading} type="button">
          Continuar
        </BrutalButton>
      </nav>
    </fetcher.Form>
  );
};
