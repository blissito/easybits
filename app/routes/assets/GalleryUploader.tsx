import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { LuImageUp } from "react-icons/lu";
import { IoClose } from "react-icons/io5";
import { cn } from "~/utils/cn";
import type { Asset } from "@prisma/client";
import { useFetcher } from "react-router";
import { useUploader } from "~/hooks/useUploader";
import { ImageIcon } from "~/components/icons/image";
import { useImageResize } from "~/hooks/useImageResize";

export const GalleryUploader = ({
  limit = Infinity,
  asset,
}: {
  limit?: number;
  host: string;
  asset: Asset;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isHovered, setIsHovered] = useState<null | "hover" | "dropping">(null);
  const [files, setFiles] = useState<File[]>([]);

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length < 1) return;

    // images only
    const fls = [...e.dataTransfer.files].filter((f) =>
      f.type.includes("image")
    );

    setFiles(fls);
  };

  const handleDragOver = (ev: DragEvent) => {
    ev.preventDefault();
    setIsHovered("dropping");
  };

  const handleDragEnter = () => {
    setIsHovered("dropping");
  };

  const handleInputFileChange = (ev: ChangeEvent<HTMLInputElement>) => {
    if (!ev.currentTarget.files) return;

    const fls = [...ev.currentTarget.files];
    // setFiles((fs) => [...fs, ...fls]);
    setFiles(fls);
  };

  const { upload, links, onRemove } = useUploader({
    assetId: asset.id,
    defaultLinks: asset.gallery,
  });

  const { resize } = useImageResize({
    async callback(blob) {
      // 1. get put url & update model?
      const response = await fetch("/api/v1/assets", {
        method: "post",
        body: new URLSearchParams({
          intent: "get_put_file_url",
          fileName: "metaImage",
          assetId: asset.id,
        }),
      });
      const putURL = await response.text();
      console.log("PUT:", putURL);
      return;
      // 2. upload
      await fetch(putURL, {
        method: "put",
        body: blob,
        headers: {
          "content-type": blob.type,
        },
      });
      // console.info("metaImage updated");
      // 3. update model... no need... because of name conventions
    },
  });
  const uploadMetaImage = async () => {
    const link = links[0];
    if (!link) return;
    resize({ link });
  };

  useEffect(() => {
    if (files.length < 1) return;

    const asyncUpload = async () => {
      const promises = files.map((f) => upload(f, asset.id));
      await Promise.all(promises);
    };
    asyncUpload();
    uploadMetaImage();
  }, [files]);

  const canUpload = limit > links.length;

  return (
    <article className="">
      <h2 className="mt-5 mb-2">Galería y miniatura principal</h2>

      <section
        className="overflow-auto"
        onMouseEnter={() => setIsHovered("hover")}
        onMouseLeave={() => setIsHovered(null)}
      >
        {links.length < 1 && canUpload && (
          <motion.button
            layoutId="upload_button"
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            type="button"
            className={cn(
              "w-full",
              "flex gap-3 border-dashed border-[1px] p-4 hover:border-brand-500 rounded-2xl py-11 justify-center items-center border-iron",
              {
                "border-iron": isHovered === "hover",
                "border-brand-500": isHovered === "dropping",
              }
            )}
          >
            {/* <img
              className={cn("w-8 aspect-square", {})}
              src="/icons/image-upload.svg"
              alt="upload illustration"
            /> */}
            <ImageIcon
              className="w-8 h-"
              fill={isHovered ? "#9870ED" : " #6A6966"}
            />
            <p
              className={cn("max-w-md text-brand-gray text-left text-sm", {
                "text-brand-500": isHovered === "hover",
              })}
            >
              Arrastra o sube los archivos. Sube un archivo comprimido (.zip) o
              sube hasta 50 archivos con un peso máximo de 250 mb en total.
            </p>
          </motion.button>
        )}
        {links.length > 0 && (
          <RowGalleryEditor
            canUpload={canUpload}
            onClick={() => fileInputRef.current?.click()}
            links={links}
            onRemove={(url) => onRemove(url, asset.id)}
          />
        )}
        <input
          multiple
          accept="image/*"
          onChange={handleInputFileChange}
          ref={fileInputRef}
          className="hidden"
          type="file"
        />
      </section>
    </article>
  );
};

const RowGalleryEditor = ({
  links = [],
  onClick,
  onRemove,
  canUpload,
}: {
  canUpload?: boolean;
  links?: string[];
  onRemove?: (arg0: string) => void;
  onClick: () => void;
}) => {
  return (
    <div className={cn("flex items-center gap-3")}>
      <LayoutGroup>
        <AnimatePresence>
          {links.map((l) => (
            <Image onRemove={() => onRemove?.(l)} key={l} src={l} />
          ))}
        </AnimatePresence>

        {links.length < 10 && canUpload && (
          <motion.button
            whileHover={{ scale: 0.95 }}
            onClick={onClick}
            layoutId="upload_button"
            type="button"
            className="grid place-items-center border rounded-2xl border-dashed border-iron hover:border-brand-500 aspect-square  max-w-[144px] min-w-[144px]"
          >
            <img className="w-8 h-8" src="/icons/image-upload.svg" />
          </motion.button>
        )}
      </LayoutGroup>
    </div>
  );
};

const Image = ({
  src,
  onRemove,
}: {
  src: string;
  onRemove?: () => void; // @todo remove file from s3
}) => {
  return (
    <motion.figure
      layout
      initial={{ x: -10, opacity: 0, filter: "blur(4px)" }}
      exit={{ x: -10, opacity: 0, filter: "blur(4px)" }}
      animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
      key={src}
      className="aspect-square max-w-[144px] min-w-[144px] relative group border rounded-2xl my-2"
    >
      <button
        type="button"
        onClick={onRemove}
        className="group-hover:block hidden bg-black text-white p-1 rounded-full absolute -right-2 -top-2"
      >
        <IoClose />
      </button>
      <img
        src={src}
        alt="preview"
        className="rounded-2xl object-cover w-full h-full"
      />
    </motion.figure>
  );
};
