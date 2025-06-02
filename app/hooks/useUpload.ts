
import { useState } from "react";

export const useUpload = (config?: { assetId?: string }) => {
  const { assetId } = config || {};
  const [isFetching, setIsFetching] = useState(false);

  const getUpload = async (fileName: string) => {
    const response = await fetch("/api/v1/uploads", {
      method: "post",
      body: new URLSearchParams({
        intent: "get_upload_link",
        fileName,
      }),
    });
    return response.json();
  };

  const putFile = async (blob: File) => {
    setIsFetching(true);
    const { url, storageKey } = await getUpload(blob.name);
    await fetch(url, {
      method: "PUT",
      body: blob,
      headers: {
        "content-type": blob.type,
      },
    });
    // the n update db
    await fetch(`/api/v1/uploads`, {
      method: "post",
      body: new URLSearchParams({
        intent: "create_uploaded_file",
        contentType: blob.type,
        name: blob.name,
        size: `${blob.size}`,
        assetId: assetId || "",
        storageKey,
      }),
    });
  };

  return { putFile, isFetching };
};
