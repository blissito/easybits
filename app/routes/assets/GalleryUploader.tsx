import { useEffect, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup } from "motion/react";
import { cn } from "~/utils/cn";
import type { Asset } from "@prisma/client";
import { useImageResize } from "~/hooks/useImageResize";
import InputImage from "~/components/common/InputImage";
import { FloatingImageGenAssistant } from "~/components/ai/FloatingImageGenAssistant";

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
      <section className="overflow-auto">
        {elemsLength < 1 && canUpload && (
          <InputImage
            alignText="left"
            buttonClassName="max-h-[144px] w-full"
            placeholder="Arrastra o sube los archivos. Sube un archivo comprimido (.zip) o sube hasta 50 archivos con un peso máximo de 250 mb en total."
            isHorizontal
            onChange={onAddFiles}
            persistFiles={false}
          />
        )}

        {elemsLength > 0 && (
          <RowGalleryEditor
            previews={
              <section className="flex gap-3">
                {srcset.map((src, i) => (
                  <InputImage.Preview
                    key={i}
                    onClose={handleRemoveFile(i)}
                    src={src}
                    previewClassName="max-w-[144px] min-w-[144px]"
                  />
                ))}
              </section>
            }
            canUpload={canUpload}
            onChange={onAddFiles}
            links={gallery}
            onRemoveLink={onRemoveLink} // @todo change name
          />
        )}
      </section>
    </article>
  );
};

const RowGalleryEditor = ({
  links = [],
  onChange,
  onRemoveLink,
  canUpload,
  previews,
}: {
  onDrop?: (arg0: File[]) => void;
  previews?: ReactNode;
  canUpload?: boolean;
  links?: string[];
  onRemoveLink?: (arg0: string) => void;
  onChange: (files: File[]) => void;
}) => {
  return (
    <div className={cn("flex items-center gap-3")}>
      <LayoutGroup>
        <AnimatePresence>
          {links.map((l) => (
            <InputImage.Preview
              key={l}
              onClose={() => onRemoveLink?.(l)}
              src={l}
              previewClassName="max-w-[144px] min-w-[144px]"
            />
          ))}
        </AnimatePresence>
        {previews}
        {links.length < 10 && canUpload && (
          <>
            <InputImage
              buttonClassName="max-w-[144px] min-w-[144px]"
              onChange={onChange}
              persistFiles={false}
              buttonProps={{ layoutId: "upload_button" }}
            />
            <FloatingImageGenAssistant
              imageUrl=""
              prompt="gato con sombrero"
              onAddFiles={onChange}
            />
          </>
        )}
      </LayoutGroup>
    </div>
  );
};
