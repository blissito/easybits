import { db } from "./db";

export type AssetCreationPayload = {
  storageKey: string;
  userId: string;
  url: string;
  status?: string;
  asset_settings?: { playback: string };
  cors_origin?: string;
};
export const createAsset = async (data: AssetCreationPayload) => {
  const { userId, storageKey, cors_origin, status, asset_settings } = data;
  return await db.asset.create({
    data: {
      userId,
      storageKey,
      metadata: { cors_origin, status, asset_settings },
    },
  });
};
