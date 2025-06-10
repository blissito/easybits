import { db } from "./db";

export type AssetCreationPayload = {
  storageKey: string;
  userId: string;
  url?: string;
  status?: string;
  asset_settings?: { playback: string };
  cors_origin?: string;
  contentType?: string;
  size: number;
  fileMetadata: any;
  publicLink?: string;
};

export const updateAsset = (assetId: string, data: any) => {
  return db.asset.update({ where: { id: assetId }, data });
};

export const createAsset = async (data: AssetCreationPayload) => {
  const {
    fileMetadata,
    contentType,
    userId,
    storageKey,
    cors_origin = "*",
    status = "uploaded",
    asset_settings = { playback: "public-read" },
    size,
    publicLink,
  } = data;
  return await db.asset.create({
    data: {
      publicLink,
      userId,
      storageKey,
      metadata: { cors_origin, status, asset_settings, ...fileMetadata },
      status,
      contentType,
      size,
    },
  });
};
