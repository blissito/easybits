import type { Asset, File } from "@prisma/client";
import { BrutalButton } from "~/components/common/BrutalButton";

export const DownloablePreview = ({
  asset,
  files = [],
}: {
  asset: Asset;
  files: File[];
}) => {
  return (
    <section className="border my-10 md:mt-0 border-white max-w-3xl rounded-2xl mx-auto flex flex-wrap md:flex-nowrap h-fit md:h-[600px] overflow-hidden ">
      <div className="w-full md:w-[50%] h-full bg-slate-600">
        <img
          className="h-full w-full object-cover"
          src={asset.gallery[0] || "/images/easybits-default.webp"}
        />
      </div>
      <div className="w-full md:w-[50%] h-full flex flex-col justify-between">
        <div className="p-4 md:p-6 h-full">
          <h3 className="text-white font-bold text-2xl">{asset.title}</h3>
          <p className="text-tale font-light mt-3">
            {asset.description?.slice(0, 100).replaceAll("#", "")}...
          </p>
          {files.map((file) => (
            <p
              key={file.id}
              className="text-tale/60 font-light mt-3 text-xs truncate"
            >
              {file.name} | {(file.size / 1_000_000).toFixed(2)} mb{" "}
            </p>
          ))}
        </div>
        <div className="flex gap-2 items-center h-fit px-4 md:px-6 py-4">
          <img className="w-10 h-10 rounded-full" src={asset.user?.picture} />
          <p className="text-tale font-light">{asset.user?.displayName}</p>
        </div>
        <div>
          <div className="border-t border-white py-3 px-4">
            <BrutalButton
              containerClassName="w-full"
              className="min-w-full bg-yellow-500 w-full "
            >
              Agregar reseña
            </BrutalButton>
          </div>
          <div className="border-t border-white py-3 px-4">
            <BrutalButton
              type="button"
              className="w-full"
              containerClassName="w-full"
            >
              Descargar
            </BrutalButton>
          </div>
        </div>
      </div>
    </section>
  );
};
