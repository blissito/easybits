import { newAssetSchema as newProductSchema } from "~/utils/zod.schemas";
import { db } from "~/.server/db";
import slugify from "slugify";
import { nanoid } from "nanoid";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/assets";
// @ts-ignore
import { deleteObject, getPutFileUrl } from "react-hook-multipart";
import { createStorageKey } from "~/.server/files";
import { createURLFromStorageKey } from "~/utils/urlConstructors";

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "new_asset") {
    const data = JSON.parse(formData.get("data") as string);
    newProductSchema.parse(data);
    return await db.asset.create({
      data: {
        ...data,
        userId: user.id,
        slug: slugify(data.title + "_" + nanoid(6)),
      },
    });
  }

  if (intent === "delete_file") {
    const url = new URL(request.url);
    const storageKey = (url.searchParams.get("storageKey") ||
      formData.get("storageKey")) as string;

    if (!storageKey)
      throw new Response("No StorageKey present", { status: 404 });

    await deleteObject(storageKey, "easybits-dev"); //Revisit Private only for now
    try {
      await db.file.delete({
        where: {
          storageKey,
        },
      });
    } catch (e) {
      console.error(e);
    }
  }

  if (intent === "get_put_url") {
    const fileName = formData.get("fileName") as string;
    const assetId = formData.get("assetId") as string;
    const directory = formData.get("directory") as string;
    const storageKey = await createStorageKey({
      directory,
      assetId,
      mode: "beta_2025",
      request,
      fileName,
    });
    if (!fileName) {
      return new Response(null, {
        status: 400,
        statusText: "::BAD_REQUEST::FILENAME_MISSING::",
      });
    }
    const isPrivate = formData.get("isPrivate") || false;
    const url = await getPutFileUrl(storageKey, 900, {
      Bucket: isPrivate ? "easybits-dev" : "easybits-public", // gallery and cover videos are public
    });
    return { url, storageKey };
  }

  if (intent === "create_new_file") {
    const storageKey = formData.get("storageKey") as string;
    const metadata = JSON.parse(formData.get("metadata") as string);
    const assetId = formData.get("assetId") as string;
    const data = {
      assetIds: [assetId],
      ownerId: user.id,
      storageKey,
      contentType: metadata.type,
      name: metadata.name,
      size: metadata.size,
      slug: slugify(storageKey + "_" + metadata.name),
      url: createURLFromStorageKey(storageKey),
    };
    // @todo validate
    return await db.file.create({ data });
  }

  return null;
};
