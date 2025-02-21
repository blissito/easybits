import { newProductSchema } from "~/utils/zod.schemas";
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
    const serviceURL = new URL(`https://video-converter-hono.fly.dev`);
    const storageKey = url.searchParams.get("storageKey")!;
    serviceURL.pathname = "/delete_all";
    serviceURL.searchParams.set(
      "webhook",
      "https://easybits.cloud/api/v1/conversion_webhook"
    );
    serviceURL.searchParams.set("storageKey", storageKey);
    const response = await fetch(serviceURL.toString(), {
      method: "delete",
      headers: {
        Authorization: "Bearer PerroTOken",
      },
    });
    const text = await response.text();
    console.info("::CONVERTER_RESPONSE::", text, response.status);
    if (response.status === 404) {
      const storageKey = url.searchParams.get("storageKey")!;
      await deleteObject(storageKey);
      await db.file.delete({
        where: {
          storageKey,
        },
      });
    }
    return new Response(text);
    // @todo delete actual file in webhook?
  }

  return null;
};
