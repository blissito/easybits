import { newAssetSchema } from "~/utils/zod.schemas";
import { db } from "~/.server/db";
import slugify from "slugify";
import { nanoid } from "nanoid";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/assets";
import type { Asset } from "@prisma/client";
import { getPutFileUrl, deleteObject } from "react-hook-multipart";
import type { Action } from "~/components/forms/NewsLetterForm";

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "get_enrolled_users") {
    const assetId = formData.get("assetId") as string;
    // @todo interesting problem...
    const users = await db.user.findMany({
      where: {
        assetIds: { has: assetId },
      },
      select: {
        displayName: true,
        id: true,
        email: true,
        newsletters: true,
        assets: true,
      },
    });

    return users;
  }

  if (intent === "update_asset_action") {
    const action = JSON.parse(formData.get("action") as string);
    const assetId = formData.get("assetId") as string;
    const asset = await db.asset.findUnique({ where: { id: assetId } });
    let actions = (asset?.actions || []) as Action[];
    if (action.id) {
      actions.splice(action.index, 1, action);
    } else {
      action.index = actions.length;
      action.id = nanoid(3);
      actions = [...new Set([...actions, action])];
    }
    return await db.asset.update({
      where: {
        id: assetId,
      },
      data: {
        actions,
      },
    });
  }

  if (intent === "remove_gallery_image_and_update_gallery") {
    const link = formData.get("url") as string;
    const assetId = formData.get("assetId") as string;
    const url = new URL(link);
    const key = url.pathname.substring(1);
    console.log("::DELETING:: ", key);
    await deleteObject(key, "easybits-public");
    await deleteObject(key, "easybits-public");
    await deleteObject(key, "easybits-public"); // 😅
    const asset = await db.asset.findUnique({
      where: {
        id: assetId,
      },
    });
    if (!asset) throw new Response(null, { status: 404 });

    const links = asset.gallery.filter((l) => l !== link);
    return await db.asset.update({
      where: { id: asset.id },
      data: { gallery: links },
    });
  }

  if (intent === "get_put_file_url") {
    const user = await getUserOrRedirect(request);
    let fileName = formData.get("fileName") as string; // + nanoid(3);
    const arr = fileName.split(".");
    fileName = `${nanoid()}.${arr[arr.length - 1]}`; // better for urlsearchparams
    const assetId = formData.get("assetId"); // + nanoid(3);
    const storageKey = `${user.id}/gallery/${assetId}/${fileName}`;
    const url = await getPutFileUrl(storageKey, 900, {
      Bucket: "easybits-public", // all galleries are public
      ACL: "public-read", // not working
    });
    return new Response(url, { status: 201 });
  }

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
    if (data.template?.slug) {
      data.slug = data.template.slug; // testing
    }
    // @todo no validation?
    return await db.asset.update({
      where: {
        id: data.id,
      },
      data: { ...data, id: undefined, userId: user.id }, // @todo remove id in parsing
    });
  }

  if (intent === "update_asset_gallery_links") {
    const data = JSON.parse(formData.get("data") as string);
    return await db.asset.update({
      where: {
        id: data.id,
      },
      data: { gallery: data.gallery, id: undefined }, // gallery
    });
  }

  if (intent === "delete_asset") {
  }

  if (intent === "remove_asset_action") {
    const actionIndex = Number(formData.get("actionIndex"));
    const assetId = formData.get("assetId") as string;

    const asset = await db.asset.findUnique({
      where: {
        id: assetId,
      },
    });

    if (!asset) throw new Response("Asset not found", { status: 404 });

    const actions = asset.actions as Action[];

    actions.splice(actionIndex, 1);
    // @todo delete file from S3

    return await db.asset.update({ where: { id: assetId }, data: { actions } });
  }

  return null;
};
