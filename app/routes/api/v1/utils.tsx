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
      getTemplate: interpolateStyles(action.markdown),
      subject: "TEST_" + action.name,
    });
  }
  return null;
};

export const interpolateStyles = (markdown: string) => {
  const s = `<html>
    <head>
      <style>
      p {
        font-size: 16px;
      }
       code {
            background:  #9870ed;
            border-radius: 9px;
            padding: 2px 4px;
            color: #f6f6f5;
          }

          pre code {
            display: block;
            background:  #282b37;
            border-radius: 9px;
            padding: 6px 8px;
            color: white;
          }
blockquote {
position: relative;
padding-left: 24px;
font-style: italic;
}
blockquote p {
color: #9870ed;
}
blockquote::after {
content: "";
position: absolute;
width: 10px;
background: white;
left: 0;
top: 0;
bottom: 0;
}
        
      </style>
    </head>
    <body>${sanitizeHtml(marked(markdown))}</body></html>`;
  return s;
};
