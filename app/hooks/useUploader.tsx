import { useState } from "react";

export const useUploader = (config: {
  onLinksUpdated?: (arg0: string[]) => void;
}) => {
  const { onLinksUpdated } = config || {};
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>([]);

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

  const putFile = async (url: string, file: File) => {
    const r = await fetch(url, {
      method: "put",
      headers: { "content-type": file.type },
    });
    return r.ok;
  };

  const upload = async (file: File, assetId: string) => {
    setFiles((fls) => [...fls, file]);
    const url = await getPublicPutUrl(file.name, assetId);
    const ok = await putFile(url, file);
    if (ok) {
      setLinks((lks) => {
        const nls = [...lks, url.split("?")[0]];
        onLinksUpdated?.(nls); // API
        return nls;
      });
    }
    return ok ? url.split("?")[0] : null;
  };

  return { upload, links, files };
};

// https://easybits-public.fly.storage.tigris.dev/679442f532aff63d473fde99/gallery/67cb288d1d00d14f5e4bc605/1da85d82-9216-4b6c-92a7-e038061570e0.jpeg
