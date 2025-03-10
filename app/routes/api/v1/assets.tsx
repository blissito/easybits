import { newAssetSchema } from "~/utils/zod.schemas";
import { db } from "~/.server/db";
import slugify from "slugify";
import { nanoid } from "nanoid";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/assets";
import type { Asset } from "@prisma/client";
import { assetSchema } from "~/routes/assets/EditAssetForm";

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "new_asset") {
    const data = JSON.parse(formData.get("data") as string);
    const parsed = newAssetSchema.parse({
      ...data,
      userId: user.id,
      slug: slugify(data.title + "_" + nanoid(4)),
    });
    return await db.asset.create({
      data: parsed as Asset,
    });
  }

  if (intent === "update_asset") {
    // @validation, only owner can update?
    const data = JSON.parse(formData.get("data") as string);
    const parsed = assetSchema.parse({
      ...data,
      userId: user.id,
    });
    return await db.asset.update({
      where: {
        id: parsed.id,
      },
      data: { ...parsed, id: undefined }, // @todo remove id in parsing
    });
  }
  if (intent === "delete_asset") {
  }

  return null;
};
