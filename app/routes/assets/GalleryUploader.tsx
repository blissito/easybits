import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup } from "motion/react";
import { cn } from "~/utils/cn";
import type { Asset } from "@prisma/client";
import { useImageResize } from "~/hooks/useImageResize";
import InputImage from "~/components/common/InputImage";
import { createURLFromStorageKey } from "~/utils/urlConstructors";
import { nanoid } from "nanoid";

type MediaItem = {
  type: 'image' | 'video';
  src: string;
  storageKey?: string;
};

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

  const handleRemoveFile = (index: number) => () => {
    if (allMedia[index].isTemporary) {
      onRemoveFile?.(index);
    } else {
      onRemoveLink?.(allMedia[index].src);
    }
  }

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      uploadMetaImage(gallery); // @todo index:0
      isFirstRender.current = false;
    }
  }, [gallery]);

  const allMedia = useMemo(() => {
    // Procesar archivos subidos (srcset) - URLs temporales
    const uploadedMedia = srcset.map((src, index) => {
      const isVideo = src.endsWith('.mp4') || src.startsWith('blob:');
      return {
        id: `uploaded-${index}`,
        type: isVideo ? 'video' as const : 'image' as const,
        src,
        isTemporary: true, // Marcar como temporal
        storageKey: `temp-${nanoid(3)}-${index}` // No tenemos un storageKey real aún
      };
    });
  
    // Procesar enlaces de la galería - URLs finales
    const galleryMedia = (gallery || []).map((src, index) => {
      const isVideo = src.endsWith('.mp4');
      return {
        id: `gallery-${index}`,
        type: isVideo ? 'video' as const : 'image' as const,
        src,
        isTemporary: false,
        storageKey: src.split('/').pop()?.split('?')[0] || `gallery-${index}`
      };
    });
  
    return [ ...galleryMedia,...uploadedMedia];
  }, [srcset, gallery]);

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
                {allMedia
                .map((media, i) => (
                  media.type === 'image' ? 
                  <InputImage.Preview
                    key={i}
                    onClose={handleRemoveFile(i)}
                    src={media.src}
                    previewClassName="max-w-[144px] min-w-[144px]"
                  /> : 
                  <InputImage.PreviewVideo
                    key={i}
                    src={media.src}
                    onClose={handleRemoveFile(i)}
                  />
                ))}
             
              </section>
            }
            canUpload={canUpload}
            onChange={onAddFiles}
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
          {links.map((l, i) => (
            <InputImage.Preview
              key={l+i}
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
          </>
        )}
      </LayoutGroup>
    </div>
  );
};

export const useGalleryUploader = (config?: {directory?: string, allowedTypes?: string}) => {
  const { directory = "gallery", allowedTypes = "video, image" } = config || {};
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const handleOnSave = async (assetId: string) => {
    // 1. upload each and save links
   const newLinks = await uploadFiles(files,assetId, {
     directory,
      async onFileUploaded(storageKey, file:File){
        await createFileModel(storageKey,assetId,file)
      }
    });
    await updateAssetGallery(assetId, newLinks)
    // @todo update asset meta image?

  };

  return {
    files,
    previews,
    handleOnSave,
    setFiles,
    setPreviews,
  };
};

type Links = Promise<string[]>;
const uploadFiles = async (files: File[],assetId: string, {
  onFileUploaded,
  directory,
}: {onFileUploaded: (storageKey: string, file: File) => void, 
  directory?: string,
   allowedTypes?: string
  }) => {
  const promises = files.map(async (file) => {
    // get url
    const { url: putURL, storageKey } = await fetch("/api/v1/files", {
      method: "post",
      body: new URLSearchParams({
        assetId,
        fileName: file.name,
        intent: "get_put_url",
        directory: directory || "gallery",
      }),
    }).then((r) => r.json());
    // put blob
    await fetch(putURL, {
      method: "put",
      body: file,
      headers: {
        "content-type": file.type,
      },
    });
    await onFileUploaded(storageKey,file) // upper callback
    // return link
    return createURLFromStorageKey(storageKey);
  });
  // 4. update asset gallery with links
  return Promise.all(promises) as Links
}

const createFileModel = async (storageKey: string, assetId: string, file: File) => {
  await fetch("/api/v1/files", {
    method: "post",
    body: new URLSearchParams({
      intent: "create_new_file",
      storageKey,
      assetId,
      metadata: JSON.stringify({
        type: file.type,
        size: file.size,
        name: file.name,
        lastModified: file.lastModified,
      }),
    }),
  })
}
const updateAssetGallery = async (assetId: string, newLinks: string[]) => {
  await fetch("/api/v1/assets", {
    method: "post", 
    body: new URLSearchParams({
      intent: "insert_link_in_gallery",
      links: newLinks.join(","),
      assetId,
    }),
  }).then((r) => r.text());
}
