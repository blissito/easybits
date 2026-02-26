import { getReadURL } from "react-hook-multipart";
import type { Route } from "./+types/downloads";
import { db } from "~/.server/db";
import { getUserOrRedirect } from "~/.server/getters";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "generate_token") {
    const user = await getUserOrRedirect(request);
    const fileId = formData.get("fileId") as string;
    const expInSecs = formData.get("expInSecs") || 60;
    const expiresIn = formData.get("expiresIn") || expInSecs;
    const file = await db.file.findUnique({ where: { id: fileId } });
    if (!file || !file.storageKey)
      throw new Response("The file does not exist", { status: 404 });

    // Check ownership: file owner or user has the asset
    const isOwner = file.ownerId === user.id;
    const hasAssetAccess =
      file.assetIds.length > 0 &&
      file.assetIds.some((aid) => user.assetIds.includes(aid));
    if (!isOwner && !hasAssetAccess) {
      throw new Response("Forbidden", { status: 403 });
    }

    const url = await getReadURL(file.storageKey, Number(expiresIn));
    return { url };
  }
  return null;
};
