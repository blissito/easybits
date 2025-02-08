import { db } from "~/.server/db";
import type { Route } from "./+types/tokens";
import { getReadURL } from "react-hook-multipart";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "generate_token") {
    const fileId = formData.get("fileId") as string;
    const expInSecs = formData.get("expInSecs") as string;
    const file = await db.file.findUnique({ where: { id: fileId } });
    if (!file || !file.storageKey)
      throw new Response("The file does not exist", { status: 404 });

    const url = await getReadURL(file.storageKey, expInSecs);
    return { url };
  }
  return null;
};
