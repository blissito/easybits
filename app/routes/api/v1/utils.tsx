import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/utils";

export const action = async ({ request }: Route.ActionArgs) => {
  const user = await getUserOrRedirect(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "test_action_email") {
    const emails = formData.get("emails") as string;
    if (!emails) return null;

    const action = JSON.parse(formData.get("action") as string);
    console.log("Enviando ", action, emails);
  }
  return null;
};
