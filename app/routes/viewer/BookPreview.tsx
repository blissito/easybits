import type { Asset, File } from "@prisma/client";
import { Link } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { useOpenLink } from "~/hooks/useOpenLink";
import { FaDownload } from "react-icons/fa";
import { HiDownload } from "react-icons/hi";

export const BookPreview = ({
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
    <section className="overflow-hidden min-h-svh h-full">
      <div id="book-preview-container">

      </div>
     
     <div className="bg-[#111111] h-20 w-full fixed bottom-0 left-0 grid grid-cols-12 px-32">

     <div className="flex flex-col col-span-4 h-full  justify-center">
          <h3 className="text-white font-bold text-xl">{asset.title}</h3>
          <div className=" flex gap-2 items-center">
          <img className="w-4 h-4 rounded-full border-b border-r border-white" src={asset.user?.picture} alt="avatar" />
          <a href={url} target="_blank">
            <p className="text-tale text-sm font-light underline">
              {asset.user?.displayName}
            </p>
          </a>
        </div>
        </div>
        <div className="col-span-2 col-start-11 grid place-content-center">
            <Link prefetch="render" to={`/dash/compras/${asset.slug}/review`}>
              <BrutalButton
                containerClassName="w-full"
                className="min-w-full bg-yellow-500 text-black w-full "
              >
                Agregar comentarios
              </BrutalButton>
            </Link>
          </div>
     </div>
    </section>
  );
};
