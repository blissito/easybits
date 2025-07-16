import { useEffect, useMemo, useRef, useState } from "react";
import { Reorder } from "motion/react";
import type { Asset } from "@prisma/client";
import { useImageResize } from "~/hooks/useImageResize";
import InputImage from "~/components/common/InputImage";
import { createURLFromStorageKey } from "~/utils/urlConstructors";
import { nanoid } from "nanoid";
import { ReorderableItem } from "~/components/galleries/ReorderableItem";

type MediaItem = {
  id: string;
  type: "image" | "video";
  src: string;
  isTemporary: boolean;
  storageKey: string;
  originalIndex: number;
  sourceType: "gallery" | "srcset";
};

export const GalleryUploader = ({
  limit = Infinity,
  asset,
  onAddFiles,
  srcset = [],
  onRemoveFile,
  onRemoveLink,
  gallery = [],
  onReorderGallery,
  onReorderSrcset,
}: {
  gallery: string[];
  onRemoveLink?: (arg0: string) => void;
  onRemoveFile?: (index: number) => void;
  srcset: string[];
  onAddFiles: (arg0: File[]) => void;
  limit?: number;
  host: string;
  asset: Asset;
  onReorderGallery?: (newOrder: string[]) => void;
  onReorderSrcset?: (newOrder: string[]) => void;
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
      // 3. Update model? No need, because of name conventions.
    },
  });
  const uploadMetaImage = async (linksArray: string[]) => {
    // Buscar la primera imagen (no video) en el array
    const firstImage = linksArray.find((link) => {
      if (!link) return false;

      // Verificar que no sea un video por extensión
      const isVideo =
        link.endsWith(".mp4") ||
        link.endsWith(".mov") ||
        link.endsWith(".avi") ||
        link.endsWith(".webm") ||
        link.includes("video");

      return !isVideo;
    });

    if (!firstImage) {
      return; // No hay imágenes disponibles para metaImage
    }

    resize({ link: firstImage });
  };

  const canUpload = limit > gallery.length + srcset.length;

  const elemsLength = srcset.length + gallery.length;

  // State for tracking drag operations
  const [isDragging, setIsDragging] = useState(false);

  // Handle reorder operations
  const handleReorder = (newOrder: MediaItem[]) => {
    try {
      // Basic validation
      if (!newOrder || newOrder.length === 0) {
        return;
      }

      // Separate gallery items from srcset items
      const galleryItems = newOrder.filter(
        (item) => item.sourceType === "gallery"
      );
      const srcsetItems = newOrder.filter(
        (item) => item.sourceType === "srcset"
      );

      // Create new ordered arrays
      const newGalleryOrder = galleryItems.map((item) => item.src);
      const newSrcsetOrder = srcsetItems.map((item) => item.src);

      // Call appropriate callbacks if the order actually changed
      const galleryChanged =
        newGalleryOrder.length !== gallery.length ||
        newGalleryOrder.some((src, index) => src !== gallery[index]);

      const srcsetChanged =
        newSrcsetOrder.length !== srcset.length ||
        newSrcsetOrder.some((src, index) => src !== srcset[index]);

      if (galleryChanged && onReorderGallery) {
        try {
          onReorderGallery(newGalleryOrder);
        } catch (error) {
          // Handle error silently
        }
      }

      if (srcsetChanged && onReorderSrcset) {
        try {
          onReorderSrcset(newSrcsetOrder);
        } catch (error) {
          // Handle error silently
        }
      }
    } catch (error) {
      // Handle error silently
    }
  };

  // Handle drag start/end for state tracking
  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleRemoveFile = (index: number) => () => {
    if (allMedia[index].isTemporary) {
      onRemoveFile?.(index);
    } else {
      onRemoveLink?.(allMedia[index].src);
    }
  };

  useEffect(() => {
    uploadMetaImage(gallery);
  }, [gallery]);

  const allMedia = useMemo((): MediaItem[] => {
    // Procesar enlaces de la galería - URLs finales
    const galleryMedia = (gallery || []).map((src, index) => {
      const isVideo = src.endsWith(".mp4");
      // Use src as stable ID for gallery items
      const stableId = `gallery-${src.split("/").pop()?.split("?")[0] || src}`;
      return {
        id: stableId,
        type: isVideo ? ("video" as const) : ("image" as const),
        src,
        isTemporary: false,
        storageKey: src.split("/").pop()?.split("?")[0] || stableId,
        originalIndex: index,
        sourceType: "gallery" as const,
      };
    });

    // Procesar archivos subidos (srcset) - URLs temporales
    const uploadedMedia = srcset.map((src, index) => {
      const isVideo = src.endsWith(".mp4") || src.startsWith("blob:");
      // Use src as stable ID for srcset items (blob URLs are stable during session)
      const stableId = `srcset-${src}`;
      return {
        id: stableId,
        type: isVideo ? ("video" as const) : ("image" as const),
        src,
        isTemporary: true,
        storageKey: `temp-${index}`,
        originalIndex: index,
        sourceType: "srcset" as const,
      };
    });

    return [...galleryMedia, ...uploadedMedia];
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
          <div className="flex items-center gap-3">
            <Reorder.Group
              axis="x"
              values={allMedia}
              onReorder={handleReorder}
              className="flex gap-3"
            >
              {allMedia.map((media, i) => (
                <ReorderableItem
                  key={media.id}
                  item={media}
                  onRemove={handleRemoveFile(i)}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  {media.type === "image" ? (
                    <InputImage.Preview
                      onClose={handleRemoveFile(i)}
                      src={media.src}
                      previewClassName="max-w-[144px] min-w-[144px]"
                    />
                  ) : (
                    <InputImage.PreviewVideo
                      src={media.src}
                      onClose={handleRemoveFile(i)}
                    />
                  )}
                </ReorderableItem>
              ))}
            </Reorder.Group>
            {allMedia.length < 10 && canUpload && (
              <InputImage
                buttonClassName="max-w-[144px] min-w-[144px]"
                onChange={onAddFiles}
                persistFiles={false}
                buttonProps={{ layoutId: "upload_button" }}
              />
            )}
          </div>
        )}
      </section>
    </article>
  );
};

export const useGalleryUploader = (config?: {
  directory?: string;
  allowedTypes?: string;
}) => {
  const { directory = "gallery", allowedTypes = "video, image" } = config || {};
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const handleOnSave = async (assetId: string) => {
    // 1. upload each and save links
    const newLinks = await uploadFiles(files, assetId, {
      directory,
      async onFileUploaded(storageKey, file: File) {
        await createFileModel(storageKey, assetId, file);
      },
    });
    await updateAssetGallery(assetId, newLinks);
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
const uploadFiles = async (
  files: File[],
  assetId: string,
  {
    onFileUploaded,
    directory,
  }: {
    onFileUploaded: (storageKey: string, file: File) => void;
    directory?: string;
    allowedTypes?: string;
  }
) => {
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
    await onFileUploaded(storageKey, file); // upper callback
    // return link
    return createURLFromStorageKey(storageKey);
  });
  // 4. update asset gallery with links
  return Promise.all(promises) as Links;
};

const createFileModel = async (
  storageKey: string,
  assetId: string,
  file: File
) => {
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
  });
};
const updateAssetGallery = async (assetId: string, newLinks: string[]) => {
  await fetch("/api/v1/assets", {
    method: "post",
    body: new URLSearchParams({
      intent: "insert_link_in_gallery",
      links: newLinks.join(","),
      assetId,
    }),
  }).then((r) => r.text());
};
