import { getSesTransport } from "./sendgridTransport";
import { welcomeEmail } from "./templates/welcomeEmail";

export const sendWelcomeEmail = (email: string, displayName?: string) => {
  return getSesTransport()
    .sendMail({
      from: "no-replay@easybits.cloud",
      subject: "Bienvenid@ a EasyBits 🎉 📻",
      bcc: [email],
      html: welcomeEmail({ displayName }),
    })
    .then((result: unknown) => console.log(result))
    .catch((e: Error) => console.error(e));
};
