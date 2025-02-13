import type { File } from "@prisma/client";
import { db } from "~/.server/db";

const CONVERTION_TOKEN = process.env.CONVERTION_TOKEN;

export const action = async ({ request }: Route) => {
  const json = await request.json();
  if (json.token !== CONVERTION_TOKEN || request.method !== "POST")
    throw new Response("Forbidden", { status: 403 });

  const storageKey = json.storageKey;
  const sizeName = json.sizeName;
  const record = await db.file.findFirst({ where: { storageKey } });
  if (!record) throw new Response("Record Not Found", { status: 404 });

  let data: Partial<File> = { storageKey };

  if (json.eventName === "onEnd") {
    data["versions"] = [...new Set([...record.versions, sizeName])];
    data["masterPlaylistURL"] = json.masterPlaylistURL;
    data["masterPlaylistContent"] = json.masterPlaylistContent;
  }

  if (json.eventName === "onError") {
    data["versions"] = record.versions.filter((v) => v !== sizeName);
  }

  await db.file.update({
    where: { id: record.id },
    data,
  });

  console.log("WEBHOOK_CALLED", data);

  return new Response(null, { status: 200 });
};
