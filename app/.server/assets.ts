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
};
export const createAsset = async (data: AssetCreationPayload) => {
  const {
    contentType,
    userId,
    storageKey,
    cors_origin = "*",
    status = "uploaded",
    asset_settings = { playback: "public-read" },
    size,
  } = data;
  return await db.asset.create({
    data: {
      userId,
      storageKey,
      metadata: { cors_origin, status, asset_settings },
      status,
      contentType,
      size,
    },
  });
};
