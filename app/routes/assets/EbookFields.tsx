import type { Asset, File } from "@prisma/client";
import { useRef, type ChangeEvent } from "react";
import { FaBook } from "react-icons/fa6";
import { IoClose } from "react-icons/io5";
import { useFetcher } from "react-router";
import { Input } from "~/components/common/Input";
import Spinner from "~/components/common/Spinner";
import { ImageIcon } from "~/components/icons/image";
import { useDropFiles } from "~/hooks/useDropFiles";
import { useUpload } from "~/hooks/useUpload";
import { cn } from "~/utils/cn";

export const EbookFields = ({
  onChange,
  asset,
  files = [],
}: {
  files: File[];
  asset: Asset;
  onChange: (name: string) => (value: string) => void;
}) => {
  const epub = files.find((f) => f.contentType?.includes("epub"));
  const pdf = files.find((f) => f.contentType?.includes("pdf"));
  const mobi = files.find((f) => f.contentType?.includes("mobi"));
  const txt = files.find((f) => f.contentType?.includes("text/plain"));

  return (
    <>
      <h2 className="text-2xl mb-3 font-bold">Completa la información de tu Ebook</h2>
      <p >Agrega tu ebook en uno o varios de los formatos disponibles</p>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-4 mb-3">
        <UploadBox file={epub} assetId={asset.id} />
        <UploadBox assetId={asset.id} type="pdf" file={pdf} />
        <UploadBox assetId={asset.id} type="mobi" file={mobi} />
        <UploadBox assetId={asset.id} type="text/plain" file={txt} />
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
          className="mt-5"
          placeholder="12"
          type="number"
        />
      </section>
    </>
  );
};

export const UploadBox = ({
  type = "epub",
  file,
  assetId,
}: {
  assetId?: string;
  file?: File;
  type?: "epub" | "pdf" | "mobi" | "text/plain";
}) => {
  const fetcher = useFetcher();
  const firstRender = useRef(true);
  const { ref, files, removeFile } = useDropFiles<HTMLDivElement>({ type });

  const localFile = file || files[0];

  const { putFile } = useUpload({
    assetId,
  });

  if (localFile) {
    if (firstRender.current) {
      if (!localFile.storageKey) {
        putFile(localFile);
      }
      firstRender.current = false;
    }

    const handleDelete = () => {
      removeFile(0);
      fetcher.submit(
        {
          intent: "delete_file",
          storageKey: localFile?.storageKey,
        },
        {
          method: "post",
          action: "/api/v1/files",
        }
      );
    };

    const isFromDB = !!localFile?.storageKey;
    const isLoading = fetcher.state !== "idle";

    return (
      <div className="text-center py-6 h-[130px] bg-brand-500/10 mt-2 flex justify-center flex-col items-center gap-4 select-none border-brand-gray border-[1px] rounded-2xl relative group px-4 overflow-hidden">
 {/* @todo Do we wanto to implement delete file? */}
        {/* {isFromDB && (
          <button
            onClick={handleDelete}
            className="absolute top-4 right-4 group-hover:visible invisible text-2xl"
          >
            {isLoading ? <Spinner /> : <IoClose />}
          </button>
        )} */}
        <span className="text-xl ">
          <FaBook />
        </span>
        <p className="text-[8px] w-full"> {localFile.name}</p>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn(
        "border-black border border-dashed rounded-xl py-8 my-2 flex items-center justify-center flex-col",
        "hover:scale-95 transition-all hover:border-brand-500",
        "cursor-pointer",
        "group"
      )}
    >
       <ImageIcon
            className={cn(
              'w-8 fill-[#6A6966] group-hover:fill-brand-500',
            )}
            unforceFill
          />
      <p className="text-brand-gray group-hover:text-brand-500 text-xs font-thin ">
        Arrastra un {" "}
        <strong className="font-semibold uppercase text-center text-xs">
          {type === "text/plain" ? "TXT" : type}
        </strong>
      </p>
    </div>
  );
};
