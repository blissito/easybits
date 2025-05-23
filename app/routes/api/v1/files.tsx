import { newAssetSchema as newProductSchema } from "~/utils/zod.schemas";
import { db } from "~/.server/db";
import slugify from "slugify";
import { nanoid } from "nanoid";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/assets";
// @ts-ignore
import { deleteObject } from "react-hook-multipart";

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

  if (intent === "update_asset") {
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

  return null;
};
