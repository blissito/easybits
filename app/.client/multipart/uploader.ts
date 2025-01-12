import type { CreateMultipartResponse } from "~/.server/tigris";

const MB = 1024 * 1024;
const partSize = 8 * MB;

type UploadCompletedData = {
  uploadId: string;
  key: string;
  fileMetadata: {
    originalName: string;
    name: string;
    size: number;
    type: string;
  };
  url: string;
  access: string;
  completedData: any;
};

type FileMetadata = {
  originalName: string;
  name: string;
  size: number;
  type: string;
};

export async function upload(
  fileName: string,
  file: File,
  options?: {
    signal?: AbortController;
    access?: string;
    handleUploadUrl?: string;
    multipart?: boolean;
    onUploadProgress?: (event: {
      total: number;
      loaded: number;
      percentage: number;
    }) => void;
  }
): Promise<UploadCompletedData> {
  const {
    access = "public-read",
    handleUploadUrl = "/api/upload",
    multipart = true,
    onUploadProgress,
  } = options || {};
  const fileMetadata: FileMetadata = {
    originalName: file.name,
    name: fileName,
    size: file.size,
    type: file.type,
  };
  // @todo
  if (!multipart) {
  }
  // 1 create multipar
  const numberOfParts = Math.ceil(file.size / partSize);
  const { uploadId, key, urls }: CreateMultipartResponse =
    await createMultipartUpload(handleUploadUrl, numberOfParts, access);
  // 2 upload one by one
  const etags = await uploadAllParts(file, urls, onUploadProgress); // @todo retrys
  // 3 complete
  const completedData = await completeMultipart({
    fileMetadata,
    key,
    uploadId,
    etags,
    handleUploadUrl,
  });

  return {
    uploadId,
    key,
    fileMetadata,
    url: "", // @todo with ACL public
    access,
    completedData,
  };
}

const createMultipartUpload = async (
  handleUploadUrl: string,
  numberOfParts: number,
  access: string
) => {
  const options: RequestInit = {
    method: "POST",
    body: JSON.stringify({
      access, // @todo ACL
      numberOfParts,
      intent: "create_multipart_upload",
    }),
    headers: {
      "content-type": "application/json",
    },
  };
  let response;
  try {
    response = await fetch(handleUploadUrl, options).then((res) => res.json());
  } catch (error: unknown) {
    throw new Error(error);
  }
  return response;
};

const completeMultipart = async (args: {
  key: string;
  uploadId: string;
  etags: string[];
  fileMetadata: FileMetadata;
  handleUploadUrl: string;
}) => {
  const { key, etags, uploadId, fileMetadata, handleUploadUrl } = args;
  return await fetch(handleUploadUrl, {
    method: "POST",
    body: JSON.stringify({
      key,
      etags,
      uploadId,
      size: fileMetadata.size,
      contentType: fileMetadata.type,
      fileMetadata,
      intent: "complete_multipart_upload",
    }),
  }).then((r) => r.json());
};

const uploadAllParts = async (
  file: File,
  urls: string[],
  cb?: (event: { total: number; loaded: number; percentage: number }) => void
) => {
  let loaded = 0;
  const uploadPromises = urls.map(async (url: string, i: number) => {
    const start = i * partSize;
    const end = Math.min(start + partSize, file.size);
    const blob = file.slice(start, end); // directly from disk, no mainthread 🤩
    const response = await fetch(url, {
      method: "PUT",
      body: blob,
    });
    loaded += partSize;
    const percentage = (loaded / file.size) * 100;
    cb?.({ total: file.size, loaded, percentage }); // on progress
    const str = response.headers.get("ETag");
    return String(str).replaceAll('"', "");
  });
  return (await Promise.all(uploadPromises)) as string[]; // [etag,etag]
};
