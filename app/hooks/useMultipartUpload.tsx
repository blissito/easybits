import { useState } from "react";

export const useMultipartUpload = (publicKey: string) => {
  const [percentage, setPercentage] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  /**
   * 1. measure file
   * 2. ask for uploadId and presignedUrls
   * 3. upload each chunk in a loop @todo(use workers to do it in parallel)
   * 4. wait for upload and measue -...
   * 5. complete multipart upload
   * 6. return file data
   */
  const handleMultipartUpload = async (file: File) => {
    setIsFetching(true);
    // 1
    const SIZE = 10000000; // 10MB
    const numberOfParts = file.size / SIZE;

    // 2
    const body = new FormData();
    body.set("intent", "start_multipart_upload");
    body.set("fileName", file.name);
    body.set("numberOfParts", String(numberOfParts));
    const { urls, uploadId } = await fetch("/api/v1/uploads", {
      method: "POST",
      body,
      headers: { Authorization: publicKey },
    }).then((r) => r.json());

    // 3 & 4
    let totalBytes = 0; // @todo this should be a react state
    const uploadPromises = urls.map(async (url: string, i: number) => {
      const start = i * SIZE;
      const end = Math.min(start + SIZE, file.size);
      const blob = file.slice(start, end); // directly from disk, no mainthread 🤩
      const response = await fetch(url, {
        method: "PUT",
        body: blob,
      });
      totalBytes += SIZE;
      setPercentage(totalBytes / file.size);
      return response.headers.get("ETag");
    });
    const ETags = await Promise.all(uploadPromises); // [etag,etag]

    // 5
    const complete = new FormData();
    complete.set("intent", "complete_multipart_upload");
    complete.set("ETags", JSON.stringify(ETags));
    complete.set("uploadId", uploadId);
    complete.set("fileName", file.name);
    complete.set("fileSize", String(file.size));
    complete.set("contentType", file.type);
    // const { multipartUploadResult } =
    await fetch("/api/v1/uploads", {
      method: "POST",
      body: complete,
      headers: { Authorization: publicKey },
    })
      .then((r) => r.json())
      .catch((e) => new Error(e));
    setIsFetching(false);
  };

  return {
    handleMultipartUpload,
    percentage,
    isFetching,
  };
};
