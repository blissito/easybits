import type { Asset, File } from "@prisma/client";
import { Link } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { useOpenLink } from "~/hooks/useOpenLink";
import { FaDownload } from "react-icons/fa";
import { HiDownload } from "react-icons/hi";

export const DownloablePreview = ({
  asset,
  files = [],
  reviewExists
}: {
  reviewExists?:boolean
  asset: Asset;
  files: File[];
}) => {
  // @todo make this a hook?
  const handleDownload = async () => {
    for await (let file of files) {
      await download(file);
    }
  };

  const download = async (file: File) => {
    const { url } = await fetch("/api/v1/downloads", {
      method: "post",
      body: new URLSearchParams({
        intent: "generate_token",
        fileId: file.id,
      }),
    }).then((r) => r.json());
    const blob = await fetch(url).then((r) => r.blob());
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.target = "_blank";
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const { url } = useOpenLink({
    localLink: `http://${asset.user.host}.localhost:3000/tienda`,
    publicLink: `https://${asset.user.host}.easybits.cloud/tienda`,
  });
  return (
    <section className="border my-0 md:mt-0 border-white bg-black max-w-3xl rounded-2xl mx-auto flex flex-wrap md:flex-nowrap h-fit md:h-[600px] overflow-hidden ">
      <div className="w-full md:w-[50%] h-[280px] md:h-full bg-slate-600">
        <img
          className="h-full w-full object-cover"
          src={asset.gallery[0] || "/images/easybits-default.webp"}
        />
      </div>
      <div className="w-full md:w-[50%] h-full flex flex-col justify-between border-t-2 border-l-0 md:border-l-2 md:border-t-0 border-white">
        <div className="p-4 md:p-6 h-full">
          <h3 className="text-white font-bold text-2xl">{asset.title}</h3>
          <p className="text-tale font-light mt-3 mb-2">
            {asset.description?.slice(0, 100).replaceAll("#", "")}...
          </p>
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between text-tale/60 font-light my-1 text-xs"
            >
              <p className="truncate flex-1">
                {file.name} | <span className="opacity-50"> {(file.size / 1_000_000).toFixed(2)} mb</span>
              </p>
              <button
                onClick={() => download(file)}
                className="ml-2 p-1 hover:bg-white/10 rounded transition-colors"
                title={`Descargar ${file.name}`}
              >
                <HiDownload className="w-[16px] h-[16px]" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-center h-fit px-4 md:px-6 py-4">
          <img className="w-10 h-10 rounded-full" src={asset.user?.picture} />
          <a href={url} target="_blank">
            <p className="text-tale font-light underline">
              {asset.user?.displayName}
            </p>
          </a>
        </div>
        <div>
           <div className="border-t border-white py-3 px-4">
            <Link prefetch="render" to={`/dash/compras/${asset.slug}/review`}>
              <BrutalButton
                containerClassName="w-full"
                className="min-w-full bg-yellow-500 text-black w-full "
              >
                Agregar comentarios
              </BrutalButton>
            </Link>
          </div>
          <div className="border-t border-white py-3 px-4">
            <BrutalButton
              onClick={handleDownload}
              type="button"
              className="w-full"
              containerClassName="w-full text-black"
            >
              Descargar
            </BrutalButton>
          </div>
        </div>
      </div>
    </section>
  );
};
