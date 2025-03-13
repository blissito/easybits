import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { LuImageUp } from "react-icons/lu";
import { IoClose } from "react-icons/io5";
import { cn } from "~/utils/cn";
import type { Asset } from "@prisma/client";

import { nanoid } from "nanoid";
import { useFetcher } from "react-router";
import { useUploader } from "~/hooks/useUploader";

export const GalleryUploader = ({ asset }: { host: string; asset: Asset }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isHovered, setIsHovered] = useState<null | "hover" | "dropping">(null);
  const [files, setFiles] = useState<File[]>([]);
  // const [links, setLinks] = useState<string[]>([]);

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
    setFiles((fs) => [...fs, ...fls]);
  };

  const fetcher = useFetcher();
  const { upload, links } = useUploader({
    async onLinksUpdated(lks) {
      fetcher.submit(
        {
          intent: "update_asset_gallery_links",
          data: JSON.stringify({ gallery: lks, id: asset.id }),
        },
        { method: "post", action: "/api/v1/assets" }
      );
    },
  });

  useEffect(() => {
    if (files.length < 1) return;

    files.map((f) => {
      upload(f, asset.id);
    });
  }, [files]);

  console.log("Links", links);

  return (
    <article className="">
      <h2 className="mt-8 mb-2">Galería y miniatura principal</h2>

      <section
        style={{
          scrollbarWidth: "none",
        }}
        className="overflow-auto"
        onMouseEnter={() => setIsHovered("hover")}
        onMouseLeave={() => setIsHovered(null)}
      >
        {files.length < 1 && (
          <motion.button
            layoutId="upload_button"
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            type="button"
            className={cn(
              "w-full",
              "flex gap-3 border-dashed border-2 rounded-2xl py-11 justify-center items-center border-brand-gray",
              {
                "border-black": isHovered === "hover",
                "border-brand-500": isHovered === "dropping",
              }
            )}
          >
            <span
              className={cn("text-4xl text-brand-gray", {
                "text-black": isHovered === "hover",
                "text-brand-500": isHovered === "dropping",
              })}
            >
              <LuImageUp />
            </span>
            <p
              className={cn("max-w-md text-brand-gray", {
                "text-black": isHovered === "hover",
                "text-brand-500": isHovered === "dropping",
              })}
            >
              Arrastra o sube los archivos. Sube un archivo comprimido (.zip) o
              sube hasta 50 archivos con un peso máximo de 1 TB en total.
            </p>
          </motion.button>
        )}
        {files.length > 0 && (
          <RowGalleryEditor
            onClick={() => fileInputRef.current?.click()}
            files={files}
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
  files = [],
  onClick,
  onRemove,
}: {
  onRemove?: () => void;
  onClick: () => void;
  files: File[];
}) => {
  return (
    <div className={cn("flex gap-3")}>
      <LayoutGroup>
        <AnimatePresence>
          {files.map((file, i) => (
            <Image onRemove={onRemove} key={i} file={file} />
          ))}
        </AnimatePresence>

        {files.length < 10 && (
          <motion.button
            onClick={onClick}
            layoutId="upload_button"
            type="button"
            className="grid place-items-center max-w-[144px] min-w-[144px] border-2 rounded-2xl border-dashed aspect-square"
          >
            <span className={cn("text-4xl text-brand-gray")}>
              <LuImageUp />
            </span>
          </motion.button>
        )}
      </LayoutGroup>
    </div>
  );
};

const Image = ({
  file,
  onRemove,
}: {
  file: File;
  onRemove?: () => void; // @todo remove file from s3
}) => {
  const virtualSrc = URL.createObjectURL(file);

  return (
    <motion.figure
      layout
      initial={{ x: -10, opacity: 0, filter: "blur(4px)" }}
      exit={{ x: -10, opacity: 0, filter: "blur(4px)" }}
      animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
      key={file.name + file.size}
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
        src={virtualSrc}
        alt="preview"
        className="rounded-2xl object-cover w-full h-full"
      />
    </motion.figure>
  );
};
