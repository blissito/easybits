import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/utils";
import { sendNewsLetter } from "~/.server/emails/sendNewsLetter";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export const action = async ({ request }: Route.ActionArgs) => {
  await getUserOrRedirect(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "test_action_email") {
    const emails = formData.get("emails") as string;
    if (!emails) return null;
    const action = JSON.parse(formData.get("action") as string);
    const email = emails.split(",")[0];
    await sendNewsLetter({
      email,
      getTemplate: () => {
        return sanitizeHtml(marked(action.markdown));
      },
      subject: "TEST_" + action.name,
    });
  }
  return null;
};
