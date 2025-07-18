import { newAssetSchema } from "~/utils/zod.schemas";
import { db } from "~/.server/db";
import slugify from "slugify";
import { nanoid } from "nanoid";
import { getUserOrNull, getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/assets";
import type { Asset, AssetType } from "@prisma/client";
import {
  getPutFileUrl,
  deleteObject,
  deleteObjects,
} from "react-hook-multipart";
import type { Action } from "~/components/forms/NewsLetterForm";
import {
  updateOrCreateProductAndPrice,
  updateProduct,
} from "~/.server/stripe_v2";
import { generateDescription } from "~/.server/llms/tools/generators/getAssetDescription";

// Función de validación de precios
const validatePriceUpdate = (oldPrice: number, newPrice: number): void => {
  // Validar que el precio no sea negativo
  if (newPrice < 0) {
    throw new Error("El precio no puede ser negativo");
  }
  if (newPrice > 999999) {
    throw new Error("El precio es demasiado alto. Máximo permitido: $999,999");
  }
  if (!Number.isFinite(newPrice)) {
    throw new Error("El precio debe ser un número válido");
  }
  // Si hay un precio anterior, validar cambios muy pequeños que podrían ser errores
  // (El warning se elimina, permitimos cualquier cambio)
  // Validar que el precio tenga máximo 2 decimales
  if (newPrice !== Math.round(newPrice * 100) / 100) {
    throw new Error("El precio debe tener máximo 2 decimales");
  }
};

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  /**
   *
   * The right path for all the public assets should be:
   *          /:UserID/:AssetID/gallery/:FileName
   * O en su defecto:
   *          /:UserID/gallery/:AssetID/:FileName
   * Pero, se prefiere la anterior.
   * Existe una convención para la meta imagen:
   *          /:UserID/gallery/:AssetID/metaImagen
   * Sin extensión soporta cualquier formato de imagen
   */

  // This is wrong DEPRECATE!
  const storageKeyBuilder = (config: {
    fileName?: string;
    deterministicKey?: "fileName" | "storageKey";
    user: typeof user;
    storageKey?: string;
    assetId?: string;
  }) => {
    const {
      fileName,
      deterministicKey = "fileName",
      user,
      storageKey,
      assetId,
    } = config;
    let finalStorageKey = `${user.id}/gallery/${assetId}/${fileName}`;

    if (storageKey) {
      if (deterministicKey === "storageKey") {
        finalStorageKey = `${user.id}${storageKey}`;
      } else {
        finalStorageKey = `${user.id}${storageKey}/${fileName}`;
      }
    }

    return finalStorageKey;
  };

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

  if (intent === "remove_gallery_image") {
    const link = formData.get("url") as string;
    // const assetId = formData.get("assetId") as string;
    // const index = formData.get("index") as string;
    const url = new URL(link);
    const key = url.pathname.substring(1);
    await deleteObject(key, "easybits-public");
    await deleteObject(key, "easybits-public");
    await deleteObject(key, "easybits-public"); // revisit 😅
    console.log("::DELETED: ", key);
    return null;
    // const asset = await db.asset.findUnique({
    //   where: {
    //     id: assetId,
    //   },
    // });
    // if (!asset) throw new Response(null, { status: 404 });

    // const update = [...asset.gallery];
    // update.splice(Number(index), 1);
    // return await db.asset.update({
    //   where: { id: asset.id },
    //   data: { gallery: update },
    // });
  }

  // create File for uploaded s3Object
  if (intent === "create_uploaded_file") {
    const user = await getUserOrNull(request);
    let fileName = formData.get("fileName") as string;
    const storageKey = formData.get("storageKey") as string;
    const assetId = formData.get("assetId") as string;

    await db.file.create({
      data: {
        name: fileName,
        storageKey,
        assetIds: [assetId],
        ownerId: user?.id,
        status: "DONE",
        slug: slugify(fileName),
        contentType: formData.get("contentType") as string,
        size: +formData.get("size")!,
        url: "",
      },
    });

    return new Response(storageKey, { status: 201 });
  }

  // injects gallery file path!! don't use out asset form editing
  if (intent === "get_put_file_url") {
    const user = await getUserOrRedirect(request);
    const isPrivate = !!formData.get("private");
    let fileName = formData.get("fileName") as string;
    const storageKey = formData.get("storageKey") as string;
    const deterministicKey = formData.get("deterministicKey") as "fileName";

    if (fileName !== "metaImage") {
      const arr = fileName.split(".");
      fileName = `${nanoid()}.${arr[arr.length - 1]}`; // keeps extension
    }
    const assetId = formData.get("assetId") as string; // + nanoid(3);
    const finalStorageKey = isPrivate
      ? `${storageKey}`
      : storageKeyBuilder({
          user,
          assetId,
          deterministicKey,
          fileName,
          storageKey,
        });
    const url = await getPutFileUrl(finalStorageKey, 900, {
      Bucket: isPrivate ? "easybits-dev" : "easybits-public", // all galleries are public
      ACL: isPrivate ? "private" : "public-read", // not working, @todo revisit
    });
    return new Response(url, { status: 201 });
  }

  if (intent === "new_asset") {
    const data = JSON.parse(formData.get("data") as string);
    // new delete objects
    const s3ObjectsToDelete = data.s3ObjectsToDelete;
    delete data.s3ObjectsToDelete;
    //
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
    console.log("[ASSET] SERVER: update_asset intent recibido");
    // @validation, only owner can update?
    const data = JSON.parse(formData.get("data") as string);
    const s3ObjectsToDelete = data.s3ObjectsToDelete;
    delete data.s3ObjectsToDelete;
    if (data.template?.slug) {
      data.slug = data.template.slug; // @todo! should recive it directly?
    }
    // @todo validation?
    let asset = await db.asset.findUnique({ where: { id: data.id } });
    if (!asset) throw new Response("Asset not found::", { status: 404 });

    const oldPrice = asset.price || 0;
    const newPrice = Number(data.price);
    console.log(
      `[ASSET] BEFORE UPDATE: oldPrice=${oldPrice}, newPrice=${newPrice}`
    );
    // Validar el cambio de precio antes de proceder
    try {
      validatePriceUpdate(oldPrice, newPrice);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Error de validación de precio";
      console.log(`[ASSET] VALIDATION ERROR: ${errorMessage}`);
      return new Response(errorMessage, { status: 400 });
    }
    // return;

    asset = await db.asset.update({
      where: {
        id: data.id,
      },
      data: {
        ...data,
        user: undefined,
        id: undefined,
        userId: user.id,
        price: newPrice,
      }, // @todo remove id in parsing?
    });
    const nuevo = asset.price;
    console.log(`[ASSET] AFTER UPDATE: asset.id=${asset.id}, nuevo=${nuevo}`);
    if (oldPrice !== nuevo) {
      console.log(
        `[ASSET] Llamando a updateOrCreateProductAndPrice para asset.id=${asset.id}`
      );
      const stripeResult = await updateOrCreateProductAndPrice(asset, request);
      console.log(`[ASSET] Stripe result:`, stripeResult);
      if (!stripeResult.ok) {
        console.log(
          `[ASSET] ERROR al actualizar precio en Stripe: ${stripeResult.error}`
        );
        return new Response(
          `Error al actualizar el precio en Stripe: ${stripeResult.error}`,
          { status: 500 }
        );
      }
    }
    // @todo errors?
    await updateProduct({
      productId: asset.stripeProduct!,
      accountId: user.stripeId!,
      images: asset.gallery,
      description: asset.note!,
    });

    // delete objects
    try {
      // @todo delete vars
      const delRes = await deleteObjects(s3ObjectsToDelete); // @todo Revisit
      console.log("DELETED??", delRes);
      const remRes = await db.file.deleteMany({
        where: {
          storageKey: {
            in: s3ObjectsToDelete,
          },
        },
      });
      console.log("REMOVED??", remRes);
    } catch (e) {
      console.error("NO se pudo borrar: ", e);
    }
    //
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

  if (intent === "insert_link_in_gallery") {
    const assetId = formData.get("assetId") as string;
    const links = formData.get("links") as string;
    return await db.asset.update({
      where: {
        id: assetId,
      },
      data: { gallery: { push: links.split(",") } }, // gallery
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

  if (intent === "generate_asset_description") {
    const assetId = formData.get("assetId") as string;
    const asset = await db.asset.findUnique({ where: { id: assetId } });
    const prompt = String(formData.get("prompt"));
    if (!asset) throw new Response("Asset not found", { status: 404 });
    const description = await generateDescription(asset, prompt);
    return description;
  }

  return null;
};
