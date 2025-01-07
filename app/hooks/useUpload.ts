import { useState } from "react";
import type { AssetCreationPayload } from "~/.server/assets";

export const useUpload = (publicKey: string) => {
  const [isFetching, setIsFetching] = useState(false);
  const [uploadData, setData] = useState<AssetCreationPayload>({
    storageKey: "",
    url: "",
  });

  const getUpload = async () => {
    const response = await fetch("/api/v1/uploads", {
      method: "post",
      headers: {
        "content-type": "application/json",
        authorization: publicKey,
      },
    });
    const d = await response.json();
    setData(d);
    return d as AssetCreationPayload;
  };

  const putFile = async (blob: File | Blob) => {
    setIsFetching(true);
    const { url, storageKey } = await getUpload();
    const response = await fetch(url, { method: "PUT", body: blob });
    console.log("blob uploaded successfully", response.ok);
    // the n update db
    await fetch(`/api/v1/uploads/${storageKey}`, {
      method: "PATCH",
      body: JSON.stringify({
        size: blob.size,
        contentType: blob.type,
        status: "uploaded",
        storageKey,
      }),
      headers: { "content-type": "application/json" },
    });
    setIsFetching(false);
  };

  return { putFile, isFetching };
};
