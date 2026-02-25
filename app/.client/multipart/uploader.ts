import retry from "async-retry";

type CreateMultipartResponse = {
  uploadId: string;
  key: string;
};

const MB = 1024 * 1024;
const partSize = 8 * MB;

export type UploadCompletedData = {
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
  const { uploadId, key }: CreateMultipartResponse =
    await createMultipartUpload(handleUploadUrl, numberOfParts, access);
  // 2 upload one by one
  const etags = await uploadAllParts({
    file,
    cb: onUploadProgress,
    handleUploadUrl,
    key,
    numberOfParts,
    uploadId,
  }); // @todo retrys
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
  return await retry(async () => {
    const res = await fetch(handleUploadUrl, {
      method: "POST",
      body: JSON.stringify({
        intent: "complete_multipart_upload",
        contentType: fileMetadata.type,
        size: fileMetadata.size,
        fileMetadata,
        uploadId,
        etags,
        key,
      }),
    });
    return await res.json();
    // @todo catch auth errors
  }); // default retrys (10)
};

const uploadOnePartAndRetry = async ({
  attempts = 5,
  url,
  blob,
}: {
  url: string;
  blob: Blob;
  attempts?: number;
}) => {
  let retryCount = 0;
  return await retry(
    async (bail) => {
      const response = await fetch(url, {
        method: "PUT",
        body: blob,
      });
      // @todo abort and content-type?
      if (403 === response.status) {
        bail(new Error("Unauthorized"));
        return;
      } else if (response.ok) {
        return response;
      } else {
        throw new Error("Unknown error");
      }
    },
    {
      retries: attempts,
      onRetry: (error) => {
        retryCount = retryCount + 1;
        if (error instanceof Error) {
          console.log(`retrying #${retryCount} Put request of ${url}`);
        }
      },
    }
  );
};

const uploadAllParts = async (options: {
  file: File;
  numberOfParts: number;
  uploadId: string;
  key: string;
  cb?: (event: { total: number; loaded: number; percentage: number }) => void;
  handleUploadUrl: string;
}) => {
  const { file, numberOfParts, uploadId, key, cb, handleUploadUrl } = options;
  let loaded = 0;
  const uploadPromises = Array.from({ length: numberOfParts }).map(
    async (_, i: number) => {
      const url = await getPutPartUrl({
        partNumber: i + 1,
        uploadId,
        key,
        handleUploadUrl,
      });
      const start = i * partSize;
      const end = Math.min(start + partSize, file.size);
      const blob = file.slice(start, end); // directly from disk, no mainthread 🤩
      const response = await uploadOnePartAndRetry({ url, blob }); // trhow error after 5 retrys
      loaded += blob.size; // exact sum
      const percentage = (loaded / file.size) * 100;
      cb?.({ total: file.size, loaded, percentage }); // on progress
      const str = response.headers.get("ETag");
      return String(str).replaceAll('"', ""); // cleaun up
    }
  );
  return (await Promise.all(uploadPromises)) as string[]; // [etag,etag]
};

const getPutPartUrl = async ({
  partNumber,
  uploadId,
  handleUploadUrl,
  key,
}: {
  handleUploadUrl: string;
  partNumber: number;
  uploadId: string;
  key: string;
}) => {
  return retry(
    async () => {
      const response = await fetch(handleUploadUrl, {
        method: "POST",
        body: JSON.stringify({
          partNumber,
          uploadId,
          key,
          intent: "get_put_part_url",
        }),
      });
      return await response.text();
    },
    { retries: 5 }
  );
};
