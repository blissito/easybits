import { gmailTransport } from "./sendgridTransport";
import { welcomeEmail } from "./templates/WelcomeEmail";

export const sendWelcomeEmail = (email: string, displayName?: string) => {
  return gmailTransport
    .sendMail({
      from: "contacto@fixter.org",
      subject: "Bienvenido a ",
      bcc: [email],
      html: welcomeEmail({ displayName }),
    })
    .then((result: unknown) => console.log(result))
    .catch((e: Error) => console.error(e));
};
