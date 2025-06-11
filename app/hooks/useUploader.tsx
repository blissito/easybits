import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

export const useUploader = (config?: {
  defaultLinks?: string[];
  onLinksUpdated?: (arg0: string[]) => void;
  assetId: string;
}) => {
  const { onLinksUpdated, defaultLinks, assetId } = config || {};
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
        index,
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

  const putFile = (url: string, body: File) =>
    fetch(url, {
      body,
      method: "put",
      headers: { "content-type": body.type },
    }).then((response) => response.ok);

  const upload = async (file: File, assetId: string) => {
    const url = await getPublicPutUrl(file.name, assetId);
    const uri = url.split("?")[0];
    const ok = await putFile(url, file);
    if (ok) {
      setLinks((lks) => [...lks, uri]); // update
    }
    // update db ==> revisit
    // fetcher.submit(
    //   {
    //     intent: "update_asset_gallery_links",
    //     data: JSON.stringify({
    //       gallery: [...new Set([...links, uri])],
    //       id: assetId,
    //     }),
    //   },
    //   { method: "post", action: "/api/v1/assets" }
    // );

    return ok ? uri : null;
  };

  useEffect(() => {
    onLinksUpdated?.(links);
  }, [links]);

  return { upload, links, onRemove };
};

// https://easybits-public.fly.storage.tigris.dev/679442f532aff63d473fde99/gallery/67cb288d1d00d14f5e4bc605/1da85d82-9216-4b6c-92a7-e038061570e0.jpeg
