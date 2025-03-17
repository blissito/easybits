import { getUserOrNull, getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/user";
import { db } from "~/.server/db";

export const action = async ({ request }: Route.ActionArgs) => {
  const url = new URL(request.url);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update_profile") {
    const user = await getUserOrRedirect(request);
    const data = JSON.parse(formData.get("data") as string);
    return await db.user.update({
      where: {
        id: user.id,
      },
      data,
    });
  }

  if (intent === "self") {
    return await getUserOrNull(request);
  }
  return null;
};
export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const intent = url.searchParams.get("intent");

  if (intent === "self") {
    return await getUserOrNull(request);
  }
  return null;
};
