import { getReadURL } from "react-hook-multipart";
import type { Route } from "./+types/downloads";
import { db } from "~/.server/db";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "generate_token") {
    // @todo auth? asset  => user
    const fileId = formData.get("fileId") as string;
    const expInSecs = formData.get("expInSecs") || 60;
    const expiresIn = formData.get("expiresIn") || expInSecs;
    const file = await db.file.findUnique({ where: { id: fileId } });
    if (!file || !file.storageKey)
      throw new Response("The file does not exist", { status: 404 });

    const url = await getReadURL(file.storageKey, Number(expiresIn));
    return { url };
  }
  return null;
};
