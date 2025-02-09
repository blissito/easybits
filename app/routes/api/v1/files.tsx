import { newProductSchema } from "~/utils/zod.schemas";
import { db } from "~/.server/db";
import slugify from "slugify";
import { nanoid } from "nanoid";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/assets";
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
    const storageKey = formData.get("storageKey") as string;
    const id = formData.get("id") as string;
    await deleteObject(storageKey); // @todo confirm
    await db.file.delete({ where: { id, storageKey, ownerId: user.id } });
    console.info("::FILE_DELETED:: ", storageKey);
    return null;
  }

  return null;
};
