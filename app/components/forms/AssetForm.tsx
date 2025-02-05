import type { Asset } from "@prisma/client";
import { useFetcher } from "react-router";
import { useForm, type FieldValues, type SubmitHandler } from "react-hook-form";
import { BrutalButton } from "../common/BrutalButton";

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
      className="flex flex-col  h-[70%]"
    >
      <h2>Asset form</h2>
      <nav className="flex justify-end gap-12 mt-auto">
        <BrutalButton
          onClick={onClose}
          type="button"
          containerClassName="rounded-3xl"
          className="bg-white rounded-3xl px-12 py-3 -translate-x-1 -translate-y-1 hover:-translate-y-1"
        >
          Cancelar
        </BrutalButton>
        <BrutalButton
          isLoading={isLoading}
          type="button"
          containerClassName="rounded-3xl"
          className="bg-brand-500 rounded-3xl px-12 py-3 -translate-x-1 -translate-y-1 hover:-translate-y-1"
        >
          Continuar
        </BrutalButton>
      </nav>
    </fetcher.Form>
  );
};
