import { db } from "~/.server/db";
import type { Route } from "./+types/direct-upload-edit";
import { getPutFileUrl, deleteObject } from "react-hook-multipart";
import { getUserOrRedirect } from "~/.server/getters";
import slugify from "slugify";
import { nanoid } from "nanoid";

export type PatchUploadPayload = {
  size?: number;
  contentType?: string;
  status?: "uploaded" | "waiting" | "error";
  storageKey: string;
};

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "get_upload_link") {
    const user = await getUserOrRedirect(request);
    const fileName = slugify(`${formData.get("fileName")}`);
    const storageKey = `${user.id}/${fileName}`; // @revisit
    // @todo update db with pending?
    const url = await getPutFileUrl(storageKey, undefined, {
      Bucket: "easybits-dev", // @todo should be env?
    });
    return { url, storageKey };
  }

  if (intent === "create_uploaded_file") {
    const user = await getUserOrRedirect(request);
    return await db.file.create({
      data: {
        contentType: formData.get("contentType") as string,
        name: formData.get("name") as string,
        size: +formData.get("size")!,
        slug: slugify(formData.get("name") as string) + "_" + nanoid(3),
        storageKey: formData.get("storageKey") as string,
        assetIds: [String(formData.get("assetId"))],
        ownerId: user.id,
        status: "DONE",
        url: "",
      },
    });
  }

  return new Response(null);
};
