import React, { createContext, useContext, useState } from "react";
import { Effect } from "effect";
import { nanoid } from "nanoid";
import { useUploadMultipart } from "react-hook-multipart/react";

export type UploadStatus =
  | "idle"
  | "uploading"
  | "success"
  | "error"
  | "cancelled";

export interface UploadTask {
  id: string;
  file: File;
  assetId: string;
  progress: number;
  status: UploadStatus;
  error?: any;
  result?: any;
  abortController: AbortController;
  fiber?: any; // Effect Fiber
}

interface UploadsContextType {
  uploads: UploadTask[];
  uploadFile: (file: File, assetId: string) => void;
  cancelUpload: (id: string) => void;
  retryUpload: (id: string) => void;
  clearUpload: (id: string) => void;
}

const UploadsContext = createContext<UploadsContextType | undefined>(undefined);

export const UploadsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const { upload } = useUploadMultipart();

  const uploadFile = (file: File, assetId: string) => {
    const id = nanoid();
    const abortController = new AbortController();
    const newTask: UploadTask = {
      id,
      file,
      assetId,
      progress: 0,
      status: "uploading",
      abortController,
    };
    setUploads((prev) => [...prev, newTask]);

    const effect = Effect.tryPromise({
      try: async () => {
        const result = await upload(
          file.name,
          file,
          ({ percentage }: { percentage: number }) => {
            setUploads((prev) =>
              prev.map((t) =>
                t.id === id
                  ? { ...t, progress: percentage, status: "uploading" }
                  : t
              )
            );
          },
          { data: { assetId }, signal: abortController.signal }
        );
        return result;
      },
      catch: (error) => {
        return error;
      },
    }).pipe(
      Effect.tap((result) => {
        setUploads((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, status: "success", result, progress: 100 } : t
          )
        );
        return Effect.unit;
      }),
      Effect.catchAll((error) => {
        setUploads((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status: "error", error } : t))
        );
        return Effect.unit;
      })
    );
    const fiber = Effect.runPromise(effect);
    setUploads((prev) => prev.map((t) => (t.id === id ? { ...t, fiber } : t)));
  };

  const cancelUpload = (id: string) => {
    setUploads((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          t.abortController.abort();
          t.fiber?.interrupt?.();
          return { ...t, status: "cancelled" };
        }
        return t;
      })
    );
  };

  const retryUpload = (id: string) => {
    const task = uploads.find((t) => t.id === id);
    if (task) {
      uploadFile(task.file, task.assetId);
    }
  };

  const clearUpload = (id: string) => {
    setUploads((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <UploadsContext.Provider
      value={{ uploads, uploadFile, cancelUpload, retryUpload, clearUpload }}
    >
      {children}
    </UploadsContext.Provider>
  );
};

export const useUploads = () => {
  const ctx = useContext(UploadsContext);
  if (!ctx)
    throw new Error("useUploads must be used within an UploadsProvider");
  return ctx;
};
