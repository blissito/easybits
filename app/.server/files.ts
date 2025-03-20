import { randomUUID } from "crypto";
import { db } from "./db";

export type FileCreationPayload = {
  name: string;
  storageKey: string;
  ownerId: string;
  size: number;
  metadata: any;
  contentType: string;
  access: string;
  url: string;
  assetIds?: string[];
  status: "PENDING" | "WORKING" | "DONE" | "ERROR" | "DELETED";
};
export const createFile = async (data: FileCreationPayload) => {
  return await db.file.create({
    data: { ...data, slug: data.storageKey },
  });
};
