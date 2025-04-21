import { db } from "~/.server/db";
import type { Route } from "../../+types/clients";
import { getUserOrRedirect } from "~/.server/getters";

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const data = JSON.parse(formData.get("data") as string);
    // @todo validate
    await db.client.create({
      data: {
        ...data,
        userId: user.id,
      },
    });
  }

  return null;
};
