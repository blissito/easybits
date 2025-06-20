import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { IoClose } from "react-icons/io5";
import { cn } from "~/utils/cn";
import type { Asset } from "@prisma/client";
import { ImageIcon } from "~/components/icons/image";
import { useImageResize } from "~/hooks/useImageResize";
import { useDropFiles } from "~/hooks/useDropFiles";

export const GalleryUploader = ({
  limit = Infinity,
  asset,
  onAddFiles,
  srcset = [],
  onRemoveFile,
  onRemoveLink,
  gallery = [],
}: {
  gallery: string[];
  onRemoveLink?: (arg0: string) => void;
  onRemoveFile?: (index: number) => void;
  srcset: string[];
  onAddFiles: (arg0: File[]) => void;
  limit?: number;
  host: string;
  asset: Asset;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isHovered, setIsHovered] = useState<null | "hover" | "dropping">(null);
  // const [files, setFiles] = useState<File[]>(externalFiles);

  // external files change
  // useEffect(() => {
  //   setFiles(externalFiles);
  // }, [externalFiles]);

  // files change
  // useEffect(() => {
  //   onChange?.(files);
  // }, [files]);

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length < 1) return;

    // images only
    const fls = [...e.dataTransfer.files].filter((f) =>
      f.type.includes("image")
    );

    addFiles(fls);
  };

  const handleDragOver = (ev: DragEvent) => {
    ev.preventDefault();
    setIsHovered("dropping");
  };

  const handleDragEnter = () => {
    setIsHovered("dropping");
  };

  const handleInputFileChange = (ev: ChangeEvent<HTMLInputElement>) => {
    if (!ev.currentTarget.files || ev.currentTarget.files?.length < 1) return;
    onAddFiles([...ev.currentTarget.files]);
  };

  // const { links, onRemove: removeFromS3 } = useUploader({
  //   assetId: asset.id,
  //   defaultLinks: asset.gallery,
  // });

  const { resize } = useImageResize({
    async callback(blob) {
      // 1. get put url
      const response = await fetch("/api/v1/assets", {
        method: "post",
        body: new URLSearchParams({
          intent: "get_put_file_url",
          fileName: "metaImage",
          assetId: asset.id, // used for file path
        }),
      });
      const putURL = await response.text();
      // console.log("PUT:", putURL);
      // 2. upload
      const res2 = await fetch(putURL, {
        method: "put",
        body: blob,
        headers: {
          "content-type": blob.type,
        },
      });
      console.log("::META_IMAGE::UPLOADED::", res2.ok);
      // 3. Update model? No need, because of name conventions.
    },
  });
  const uploadMetaImage = async (linksArray: string[]) => {
    const link = linksArray[0];
    if (!link) return;

    resize({ link });
  };

  const canUpload = limit > gallery.length + srcset.length;

  const elemsLength = srcset.length + gallery.length;

  const handleRemoveFile = (index: number) => () => onRemoveFile?.(index);

  useEffect(() => {
    uploadMetaImage(gallery); // @todo index:0
  }, [gallery]);

  return (
    <article className="">
      <h2 className="mt-5 mb-2">Galería y miniatura principal</h2>

      <section
        className="overflow-auto flex gap-3"
        onMouseEnter={() => setIsHovered("hover")}
        onMouseLeave={() => setIsHovered(null)}
      >
        {elemsLength < 1 && canUpload && (
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
            <ImageIcon
              className="w-8 h-8"
              fill={isHovered ? "#9870ED" : "#6A6966"}
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

        {elemsLength > 0 && (
          <RowGalleryEditor
            previews={
              <section className="flex gap-3 ">
                {srcset.map((src, i) => (
                  <Image
                    onRemove={handleRemoveFile(i)}
                    as="figure"
                    key={i}
                    src={src}
                  />
                ))}
              </section>
            }
            canUpload={canUpload}
            onClick={() => fileInputRef.current?.click()}
            onDrop={onAddFiles}
            links={gallery}
            onRemoveLink={onRemoveLink} // @todo change name
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
  onRemoveLink,
  canUpload,
  previews,
  onDrop,
}: {
  onDrop?: (arg0: File[]) => void;
  previews?: ReactNode;
  canUpload?: boolean;
  links?: string[];
  onRemoveLink?: (arg0: string) => void;
  onClick: () => void;
}) => {
  const { ref } = useDropFiles<HTMLButtonElement>({ onDrop });
  return (
    <div className={cn("flex items-center gap-3")}>
      <LayoutGroup>
        <AnimatePresence>
          {links.map((l) => (
            <Image onRemove={() => onRemoveLink?.(l)} key={l} src={l} />
          ))}
        </AnimatePresence>
        {previews}
        {links.length < 10 && canUpload && (
          <motion.button
            ref={ref}
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
  as,
  onRemove,
}: {
  as?: string;
  src: string;
  onRemove?: () => void; // click on X
}) => {
  // const C = as ? as : "motion.figure"; // revisit
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
