// DEPRECATED

import type { File as AssetFile } from "@prisma/client";
import { useEffect, useRef, useState } from "react";
import { createURLFromStorageKey } from "~/utils/urlConstructors";

export const VideoCover = ({
  ref,
  mode = "editing",
  src,
  assetFiles,
  ...props
}: {
  assetFiles?: AssetFile[];
  src?: string;
  mode?: "editing";
  ref: any;
  [x: string]: any;
}) => {
  const video = assetFiles?.find((f) => f.contentType.includes("video"));
  console.log("??", assetFiles);
  return (
    <label>
      <h2 className="text-2xl font-bold mb-3">Video de portada</h2>
      {src ? (
        <video
          className="aspect-video rounded-3xl max-w-xs"
          loop
          muted
          autoPlay
          src={src}
        />
      ) : (
        <input ref={ref} type="file" {...props} />
      )}
    </label>
  );
};

export const useVideoCover = () => {
  const [videoFile, setVideoFile] = useState<null | File>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const [previewSrc, setPreviewSrc] = useState<undefined | string>(undefined);
  const [storageKey, setStorageKey] = useState("");

  const catchStorageKey = (url: string) => {
    console.log("AVERS:", url);
  };

  /** Upper form is getting submited
   * 1. upload video file to s3
   * 2. Create a File (AssetId, FileId)
   * @todo try/catch
   */

  // very custom for this app
  const onSave = async (assetId: string) => {
    const { url: putURL, storageKey } = await fetch("/api/v1/files", {
      method: "post",
      body: new URLSearchParams({
        intent: "get_put_url",
        fileName: videoFile!.name,
        assetId,
      }),
    }).then((r) => r.json());
    catchStorageKey(putURL);
    await fetch(putURL, {
      method: "put",
      body: videoFile,
      headers: {
        "content-type": videoFile!.type,
      },
    });
    // create file
    await fetch("/api/v1/files", {
      method: "post",
      body: new URLSearchParams({
        intent: "create_new_file",
        storageKey,
        assetId,
        metadata: JSON.stringify({
          type: videoFile?.type,
          size: videoFile?.size,
          name: videoFile?.name,
          lastModified: videoFile?.lastModified,
        }),
      }),
    }).then((r) => r.text());
    // update asset gallery
    await fetch("/api/v1/assets", {
      method: "post",
      body: new URLSearchParams({
        intent: "insert_link_in_gallery",
        link: createURLFromStorageKey(storageKey),
        assetId,
      }),
    }).then((r) => r.text());
  };

  const createPreview = () => {
    setPreviewSrc(URL.createObjectURL(videoFile!));
  };

  const handleChange = (ev: Event) => {
    const file = (ev.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;

    console.info("Creating preview");
    setVideoFile(file);
  };

  useEffect(() => {
    if (!videoFileInputRef.current) return;
    const node = videoFileInputRef.current;
    node.addEventListener("change", handleChange);
    return () => {
      node.removeEventListener("change", handleChange);
    };
  }, []); // start up

  useEffect(() => {
    if (!videoFile) return;

    createPreview();
  }, [videoFile]); // file listener

  return { previewSrc, videoFileInputRef, onSave };
};
