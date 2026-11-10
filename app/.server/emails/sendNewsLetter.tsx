// Newsletter (gmail, contacto@fixter.org). Los correos de acceso
// (magic link, confirmación) viven en ./sendAuthEmails.
import { gmailTransport } from "./sendgridTransport";

export const sendNewsLetter = (options: {
  email: string;
  data?: any;
  subject?: string;
  getTemplate: (data?: any) => string;
}) => {
  const { getTemplate, subject, data, email } = options;
  return gmailTransport
    .sendMail({
      from: "contacto@fixter.org",
      to: email,
      subject,
      html: getTemplate(),
    })
    .then((r: unknown) => console.info("EMAIL_SUCCESS::", r))
    .catch((e: unknown) => console.error("EMAIL_ERROR::", e));
};
