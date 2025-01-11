import type { GetMultipartResponse } from "~/.server/tigris";

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
};

export async function upload(
  fileName: string,
  file: File,
  options?: {
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
  } = options || {};
  const fileMetadata = {
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
  const { uploadId, key, urls }: GetMultipartResponse =
    await createMultipartUpload(handleUploadUrl, numberOfParts, access);
  // 2 upload one by one
  // 3 complete

  return {
    uploadId,
    key,
    fileMetadata,
    url: "",
    access,
  };
  // returns blob data and url
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
  return await fetch(handleUploadUrl, options).then((res) => res.json());
};
