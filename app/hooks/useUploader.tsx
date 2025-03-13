import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

export const useUploader = (config: {
  defaultLinks?: string[];
  onLinksUpdated?: (arg0: string[]) => void;
}) => {
  const { onLinksUpdated, defaultLinks } = config || {};
  //   const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>(defaultLinks || []);
  const fetcher = useFetcher();

  // @todo remove
  const onRemove = (url: string, assetId: string) => {
    const filtered = [...links].filter((l) => l !== url);
    setLinks(filtered);
    fetcher.submit(
      {
        url,
        assetId,
        intent: "remove_gallery_image_and_update_gallery",
      },
      {
        method: "post",
        action: "/api/v1/assets",
      }
    );
  };

  const getPublicPutUrl = async (fileName: string, assetId: string) => {
    const response = await fetch("/api/v1/assets", {
      method: "post",
      body: new URLSearchParams({
        intent: "get_put_file_url",
        fileName,
        assetId,
      }),
    });
    return await response.text();
  };

  const putFile = (url: string, body: File) => {
    return fetch(url, {
      body,
      method: "put",
      headers: { "content-type": body.type },
    }).then((response) => response.ok);
  };

  const upload = async (file: File, assetId: string) => {
    // const vsrc = URL.createObjectURL(file);
    // setLinks((lks) => [...lks, vsrc]); // <================== revisit

    const url = await getPublicPutUrl(file.name, assetId);
    const ok = await putFile(url, file);
    if (ok) {
      setLinks((lks) => [...lks, url.split("?")[0]]);
    }
    return ok ? url.split("?")[0] : null;
  };

  useEffect(() => {
    onLinksUpdated?.(links);
  }, [links]);

  return { upload, links, onRemove };
};

// https://easybits-public.fly.storage.tigris.dev/679442f532aff63d473fde99/gallery/67cb288d1d00d14f5e4bc605/1da85d82-9216-4b6c-92a7-e038061570e0.jpeg
