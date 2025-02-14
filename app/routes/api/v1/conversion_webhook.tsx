import type { File } from "@prisma/client";
import { db } from "~/.server/db";
import type { Route } from "./+types/conversion_webhook";

const CONVERTION_TOKEN = process.env.CONVERTION_TOKEN;

export const action = async ({ request }: Route.ActionArgs) => {
  //   if (request.method !== "POST")
  //     throw new Response("__Forbidden__", { status: 403 });

  const formData = await request.formData();
  const storageKey = formData.get("storageKey") as string;
  const sizeName = formData.get("sizeName") as string;
  const eventName = formData.get("eventName") as string;
  const token = formData.get("token") as string;
  console.log("STORAGE_KEY", storageKey);
  console.log("size", sizeName);
  console.log("token", token, CONVERTION_TOKEN, token !== CONVERTION_TOKEN);
  if (!storageKey || !sizeName || token !== CONVERTION_TOKEN)
    throw new Response("missing props", { status: 401 });

  const record = await db.file.findFirst({ where: { storageKey } });
  if (!record) throw new Response("Record Not Found", { status: 404 });

  let data: Partial<File> = { storageKey };

  if (eventName === "onEnd") {
    const masterPlaylistURL = formData.get("masterPlaylistURL") as string;
    const masterPlaylistContent = formData.get(
      "masterPlaylistContent"
    ) as string;
    data["versions"] = [...new Set([...record.versions, sizeName])];
    data["masterPlaylistURL"] = masterPlaylistURL; // @todo
    data["masterPlaylistContent"] = masterPlaylistContent;
  }

  if (eventName === "onError") {
    data["versions"] = record.versions.filter((v) => v !== sizeName);
  }

  await db.file.update({
    where: { id: record.id },
    data: {
      ...data,
      masterPlaylistContent:
        (record.masterPlaylistContent || "") +
        (data.masterPlaylistContent || ""),
    },
  });

  console.log("WEBHOOK_CALLED", data);

  return new Response(null, { status: 201 });
};

export const loader = () => null;
