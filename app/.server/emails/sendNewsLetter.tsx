import { sendgridTransport } from "./sendgridTransport";
import { confirmation } from "./templates/confirmation";

export const sendConfrimation = (email: string, data: any, html?: string) => {
  return sendgridTransport
    .sendMail({
      from: "contacto@fixter.org",
      subject: "👽 Confirmando que eres humano 🤖",
      bcc: [email],
      html: confirmation({ link: `@todo link` }),
    })
    .then((result: unknown) => console.log(result))
    .catch((e: Error) => console.error(e));
};

export const sendNewsLetter = (options: {
  email: string;
  data?: any;
  subject?: string;
  getTemplate: (data?: any) => string;
}) => {
  const { getTemplate, subject, data, email } = options;
  return sendgridTransport
    .sendMail({
      from: "contacto@fixter.org",
      subject: subject || "👽 Confirmando que eres humano 🤖",
      bcc: [email],
      html: getTemplate(data),
    })
    .then((result: unknown) => console.info(result))
    .catch((e: Error) => console.error(e));
};
