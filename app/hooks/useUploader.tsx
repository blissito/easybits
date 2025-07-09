import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

export const useUploader = (config?: {
  defaultLinks?: string[];
  onLinksUpdated?: (arg0: string[]) => void;
  assetId?: string;
  storageKey?: string;
  deterministicKey?: 'fileName' | 'storageKey'; // when is equal to storageKey the file name will be determinate for storageKey not fileName
}) => {
  const { onLinksUpdated, defaultLinks, assetId, storageKey, deterministicKey = 'fileName' } = config || {};
  const [links, setLinks] = useState<string[]>(defaultLinks || []);
  const fetcher = useFetcher();

  // get real objects?
  useEffect(() => {
    // const link = links.shift();
    // fetcher.submit({intent:'list_objects', })
  }, []);

  // @todo need to support cancel
  const onRemove = async (url: string, assetId: string) => {
    const urls = [...links];
    const index = urls.findIndex((string) => string === url);
    urls.splice(index, 1);
    setLinks(urls);

    await fetch("/api/v1/assets", {
      method: "post",
      body: new URLSearchParams({
        index: String(index),
        url,
        assetId,
        intent: "remove_gallery_image",
      }),
    });

    // return fetcher.submit(
    //   {
    //     index,
    //     url,
    //     assetId,
    //     intent: "remove_gallery_image",
    //   },
    //   {
    //     method: "post",
    //     action: "/api/v1/assets",
    //   }
    // );
  };

  const getPrivatePutUrl = async (fileName: string, assetId: string, storageKey?: string) => {
    const params = new URLSearchParams({
      intent: "get_put_file_url",
      fileName,
      private: 'true',
      deterministicKey,
      assetId,
    });

    if (storageKey) params.set('storageKey', storageKey);

    const response = await fetch("/api/v1/assets", {
      method: "post",
      body: params,
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get private URL: ${response.statusText}`);
    }
    
    return await response.text();
  };

  const getPublicPutUrl = async (fileName: string, assetId?: string) => {
    const response = await fetch("/api/v1/assets", {
      method: "post",
      body: new URLSearchParams({
        intent: "get_put_file_url",
        fileName,
        assetId: assetId || '',
        storageKey: storageKey || '',
        deterministicKey,
      }),
    });
    return await response.text();
  };

  const putFile = (url: string, body: File) =>
    fetch(url, {
      body,
      method: "put",
      headers: { "content-type": body.type },
    }).then((response) => response.ok);

  const upload = async (file: File, assetId?: string, config?: {
    isPrivate?: boolean;
    storageKey?: string;
  }) => {
    const {
      isPrivate = false,
      storageKey: customStorageKey,
    } = config || {};
    
    const url = isPrivate
      ? await getPrivatePutUrl(file.name, assetId!, customStorageKey)
      : await getPublicPutUrl(file.name, assetId);
    
    const uri = url.split("?")[0];

    const ok = await putFile(url, file);
    if (ok) {
      setLinks((lks) => [...lks, uri]); // update
      // @todo update db
      await fetch("/api/v1/assets", {
        method: "post",
        body: new URLSearchParams({
          intent: "create_uploaded_file",
          contentType: file.type,
          name: file.name,
          size: `${file.size}`,
          assetId: assetId!,
          storageKey:storageKey!,
          fileName: file.name,
        }),
      });
    }
    return ok ? uri : null;
  };

  useEffect(() => {
    onLinksUpdated?.(links);
  }, [links]);

  return { upload, links, onRemove };
};

// https://easybits-public.fly.storage.tigris.dev/679442f532aff63d473fde99/gallery/67cb288d1d00d14f5e4bc605/1da85d82-9216-4b6c-92a7-e038061570e0.jpeg
