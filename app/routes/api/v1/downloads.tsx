import { getReadURL } from "react-hook-multipart";
import type { Route } from "./+types/downloads";
import { redirect } from "react-router";
import { decode } from "./tokens";
import { setSessionCookie } from "~/.server/getters";
import { db } from "~/.server/db";

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "generate_token") {
    console.log("here");
    const fileId = formData.get("fileId") as string;
    const expInSecs = formData.get("expInSecs") as string;
    const expiresIn = formData.get("expiresIn") as string;
    const file = await db.file.findUnique({ where: { id: fileId } });
    if (!file || !file.storageKey)
      throw new Response("The file does not exist", { status: 404 });

    const url = await getReadURL(
      file.storageKey
      // Number(expiresIn || expInSecs)
    );
    return { url };
  }

  if (intent === "set_session") {
    const tokenData = decode(new URL(request.url));
    if (!tokenData) throw redirect("/dash");

    return await setSessionCookie({
      email: tokenData.email,
      request,
    });
  }

  return null;
};
