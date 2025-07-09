import type { Asset, File } from "@prisma/client";
import {  useContext, useRef,  type ChangeEvent } from "react";
import { FaBook } from "react-icons/fa6";
import { IoClose } from "react-icons/io5";
import { useFetcher } from "react-router";
import { BrutalButtonClose } from "~/components/common/BrutalButtonClose";
import { Input } from "~/components/common/Input";
import Spinner from "~/components/common/Spinner";
import { ImageIcon } from "~/components/icons/image";
import { useDropFiles } from "~/hooks/useDropFiles";
import { cn } from "~/utils/cn";
import { FaFile } from "react-icons/fa";
import { EbookContext } from "./EditAssetForm";

export const EbookFields = ({
  onChange,
  asset,
  assetFiles,
}: {
  asset: Asset;
  onChange: (file: any) => void;
  assetFiles: File[];
}) => {


  const {
    ebookFiles, 
    handleEbookChange,
    removeEbookFile,
    enqueueDelete,
    s3ObjectsToDelete
  } = useContext(EbookContext) as { ebookFiles: Record<string, File>; handleEbookChange: (file: File) => void; removeEbookFile: (key: string) => void; enqueueDelete: (storageKey: string) => void; s3ObjectsToDelete: string[]; }

  const epub = assetFiles.find((f) => f.contentType?.includes("epub"));
  const pdf = assetFiles.find((f) => f.contentType?.includes("pdf"));
  const mobi = assetFiles.find((f) => f.contentType?.includes("mobi"));
  const txt = assetFiles.find((f) => f.contentType?.includes("text/plain"));
  const docx = assetFiles.find((f) => f.contentType?.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"));

  return (
    <>
      <h2 className="text-2xl mb-3 font-bold">Completa la información de tu Ebook</h2>
      <p >Agrega tu ebook en uno o varios de los formatos disponibles</p>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-4 mb-3">
        <UploadBox
         type="epub" 
         assetFile={epub} 
         localFile={ebookFiles['application/epub+zip']} 
         assetId={asset.id} 
        onChange={handleEbookChange} 
        onRemove={()=>  removeEbookFile('application/epub+zip')}
        enqueueDelete={()=>enqueueDelete(epub?.storageKey as string)}
        isEnqueuedToDelete={s3ObjectsToDelete.includes(epub?.storageKey as string)}
        />
        <UploadBox 
        isEnqueuedToDelete={s3ObjectsToDelete.includes(pdf?.storageKey as string)}
        type="pdf" 
        assetFile={pdf} 
        localFile={ebookFiles['application/pdf']} 
        assetId={asset.id} 
        onChange={handleEbookChange} 
        onRemove={()=> removeEbookFile('application/pdf')}
        enqueueDelete={()=>enqueueDelete(pdf?.storageKey as string)}/>
        <UploadBox 
        isEnqueuedToDelete={s3ObjectsToDelete.includes(mobi?.storageKey as string)}
            type="mobi" 
        assetFile={mobi}
         localFile={ebookFiles['application/x-mobipocket-ebook']} 
        assetId={asset.id} 
        onChange={handleEbookChange} 
        onRemove={()=> removeEbookFile('application/x-mobipocket-ebook')}
        enqueueDelete={()=>enqueueDelete(mobi?.storageKey as string )}/>
          <UploadBox 
        isEnqueuedToDelete={s3ObjectsToDelete.includes(txt?.storageKey as string)}
        type="text/plain"
         assetFile={txt} 
         localFile={ebookFiles['text/plain']} 
         assetId={asset.id} 
        onChange={handleEbookChange} 
        onRemove={()=> removeEbookFile('text/plain')}
        enqueueDelete={()=>enqueueDelete(txt?.storageKey as string)}/>
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
              onChange?.("freePages")(ev.currentTarget.value)) 
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
  assetFile,
  localFile,
  onChange,
  onRemove,
  enqueueDelete,
  isEnqueuedToDelete
}: {
  localFile?: File;
  assetFile?: File;
  assetId?: string;
  type?: "epub" | "pdf" | "mobi" | "text/plain";
  onChange: (file: any) => void;
  onRemove?: () => void;
  enqueueDelete?: () => void;
  isEnqueuedToDelete?: boolean;
}) => {
  const fetcher = useFetcher();
  const firstRender = useRef(true);
  const { ref, removeFile } = useDropFiles<HTMLDivElement>({ 
    onChange: (files)=>{
      if(files.length > 0 ){
        onChange(files[files.length - 1])
      }
    },
    type, avoidClickWhenFiles: true });

  const isLoading = fetcher.state !== "idle";
  if(assetFile && !isEnqueuedToDelete) {
    return (
      <div
       className="text-center py-6 h-[130px] bg-brand-500/10 mt-2 flex justify-center flex-col items-center gap-4 select-none border-brand-gray border-[1px] rounded-2xl relative group px-4 overflow-hidden"
     >
 {/* @todo Do we wanto to implement delete file? */}

          <BrutalButtonClose
                 mode="mini"
            isLoading={isLoading}
            onClick={enqueueDelete}
            className="absolute top-2 right-2 invisible group-hover:visible"
          >
            {isLoading ? <Spinner /> : <IoClose />}
          </BrutalButtonClose>

        <span className="text-xl ">
          <FaBook />
        </span>
        <p className="text-[8px] w-full"> {assetFile.name}</p>
      </div>
    );
  }

  if (localFile) {
    if (firstRender.current) {
      if (!localFile.storageKey) {
        // putFile(localFile as any);   // upload file to s3 vía presigned urls
      }
      firstRender.current = false;
      // (ref.current as HTMLDivElement)?.onclick = undefined;
    }



    return (
      <div
       className="text-center py-6 h-[130px] bg-brand-500/10 mt-2 flex justify-center flex-col items-center gap-4 select-none border-brand-gray border-[1px] rounded-2xl relative group px-4 overflow-hidden">
 {/* @todo Do we wanto to implement delete file? */}
          <BrutalButtonClose
          mode="mini"
            isLoading={isLoading}
            onClick={onRemove}
            className="absolute top-2 right-2 invisible group-hover:visible"
          >
            {isLoading ? <Spinner /> : <IoClose />}
          </BrutalButtonClose>
        <span className="text-xl ">
        <FaFile/>
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
