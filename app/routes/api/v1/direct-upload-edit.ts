import { db } from "~/.server/db";
import type { Route } from "./+types/direct-upload-edit";

export type PatchUploadPayload = {
  size?: number;
  contentType?: string;
  status?: "uploaded" | "waiting" | "error";
  storageKey: string;
};

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "PATCH") return;

  const data: PatchUploadPayload = await request.json();
  await db.asset.update({
    where: {
      storageKey: data.storageKey,
    },
    data,
  });
  return new Response(null);
};
