import type { Asset } from "@prisma/client";
import type { ChangeEvent } from "react";
import { Input } from "~/components/common/Input";
import { ImageIcon } from "~/components/icons/image";
import { useDropFiles } from "~/hooks/useDropFiles";
import { cn } from "~/utils/cn";

export const EbookFields = ({
  onChange,
  asset,
}: {
  asset: Asset;
  onChange: (name: string) => (value: string) => void;
}) => {
  return (
    <>
      <h2 className="text-2xl mb-3">Completa la información de tu libro</h2>
      <p className="mb-2">Agrega tu libro en los formatos disponibles</p>
      <section className="grid grid-cols-4 gap-4 mb-3">
        <UploadBox />
        <UploadBox type="pdf" />
        <UploadBox type="mobi" />
        <UploadBox type="txt" />
      </section>
      <section>
        <Input
          defaultValue={
            asset.metadata?.numberOfPages
              ? `${asset.metadata?.numberOfPages}`
              : undefined
          }
          type="number"
          onChange={
            ((ev: ChangeEvent<HTMLInputElement>) =>
              onChange("numberOfPages")(ev.currentTarget.value)) as any
          }
          label="Número de páginas"
          placeholder="120"
        />
        <Input
          defaultValue={
            asset.metadata?.numberOfPages
              ? `${asset.metadata?.freePages}`
              : undefined
          }
          onChange={
            ((ev: ChangeEvent<HTMLInputElement>) =>
              onChange("freePages")(ev.currentTarget.value)) as any
          }
          label="Páginas disponibles para previsualización gratuita"
          placeholder="12"
          type="number"
        />
      </section>
    </>
  );
};

export const UploadBox = ({
  type = "epub",
}: {
  type?: "epub" | "pdf" | "mobi" | "txt";
}) => {
  const { ref } = useDropFiles<HTMLDivElement>({ type: "epub" });
  return (
    <div
      ref={ref}
      className={cn(
        "border-brand-gray border-2 border-dashed rounded-xl py-8 my-2 flex items-center justify-center flex-col",
        "hover:scale-105",
        "cursor-pointer",
        "group"
      )}
    >
      <ImageIcon className="w-8 group-hover:scale-90 transition-all" />
      <span className="text-brand-gray text-xs font-thin">
        Arrastra o sube el{" "}
        <strong className="font-semibold uppercase">{type}</strong>
      </span>
    </div>
  );
};
