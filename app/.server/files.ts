import { randomUUID } from "crypto";
import { db } from "./db";
import { nanoid } from "nanoid";
import { getUserOrNull } from "./getters";
import path from "path";

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
  actionId?: string;
  status: "PENDING" | "WORKING" | "DONE" | "ERROR" | "DELETED";
  source?: string;
};
export const createFile = async (data: FileCreationPayload) => {
  return await db.file.create({
    data: { ...data, slug: data.storageKey },
  });
};

export const createStorageKey = async ({
  mode = "beta_2025",
  request,
  assetId,
  directory = "gallery",
  fileName = nanoid(3),
}: {
  directory?: string;
  assetId: string;
  request: Request;
  mode: "beta_2025";
  fileName?: string;
}) => {
  const user = await getUserOrNull(request);
  if (!user) {
    return `temp/assets/${assetId}/${directory}/${fileName}`;
  }
  if (mode === "beta_2025") {
    // @todo not throw, save instead?
    if (!user) throw new Error("No user session found");

    return `${user.id}/${assetId}/${directory}/${fileName}`;
  }
  return fileName;
};
